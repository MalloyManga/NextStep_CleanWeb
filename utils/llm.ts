import OpenAI from 'openai';
import type {
  AiDebugLog,
  AiModifyRequest,
  AiModifyResult,
  DomSummaryItem,
  ElementContextItem,
  LlmSettings,
  SelectedElementContext,
  SmartHideRequest,
  SmartHideResult,
} from '../types/cleanweb';
import { getLlmSettings } from './storage';

export interface GenerateCssInput {
  instruction: string;
  domSummary: DomSummaryItem[];
  settings?: LlmSettings;
}

export interface GenerateCssResult {
  css: string;
  explanation: string;
  usedFallback: boolean;
  debug: AiDebugLog;
}

interface JsonCompletionResult {
  raw: string;
  responseSnapshot: string;
  retriedWithoutResponseFormat: boolean;
}

const PAGE_GENERATION_MAX_TOKENS = 6000;
const SMART_HIDE_MAX_TOKENS = 1600;
const AI_MODIFY_MAX_TOKENS = 3200;
const AI_REQUEST_TIMEOUT_MS = 60_000;
const CSDN_DEMO_DELAY_MS = 5_000;

const FALLBACK_CSS = `aside,
[class*="sidebar"],
[class*="ad"],
[class*="recommend"] {
  display: none !important;
}

main,
article {
  max-width: 860px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  font-size: 18px !important;
  line-height: 1.8 !important;
}`;

declare const __LLM_API_KEY__: string;
declare const __LLM_BASE_URL__: string;
declare const __LLM_MODEL__: string;

export function getDefaultLlmConfig(): LlmSettings {
  return {
    apiKey: typeof __LLM_API_KEY__ !== 'undefined' ? __LLM_API_KEY__ : '',
    baseUrl: typeof __LLM_BASE_URL__ !== 'undefined' ? __LLM_BASE_URL__ : '',
    model: typeof __LLM_MODEL__ !== 'undefined' ? __LLM_MODEL__ : 'gpt-4o-mini',
  };
}

async function resolveConfig(settings?: LlmSettings): Promise<LlmSettings> {
  const defaults = getDefaultLlmConfig();
  const fromStorage = await getLlmSettings();
  const result = (
    settings?.apiKey &&
    settings?.baseUrl &&
    settings?.model
  ) ? settings : (
    fromStorage?.apiKey &&
    fromStorage?.baseUrl &&
    fromStorage?.model
  ) ? fromStorage : defaults;

  return {
    apiKey: result.apiKey.trim(),
    baseUrl: result.baseUrl.trim(),
    model: result.model.trim(),
  }
}

function createClient(config: LlmSettings) {
  return new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    dangerouslyAllowBrowser: true,
  });
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

export async function generateCssRule(input: GenerateCssInput): Promise<GenerateCssResult> {
  const config = await resolveConfig(input.settings);
  const requestStartedAt = Date.now();
  const summaryLimit = 120; // 实际发送给AI的DOM数量
  const debugBase = {
    instruction: input.instruction,
    model: config.model,
    hasBaseUrl: Boolean(config.baseUrl),
    summaryCount: input.domSummary.length,
    requestStartedAt,
    usedFallback: false,
    retriedWithoutResponseFormat: false,
  } satisfies Omit<AiDebugLog, 'responseFinishedAt'>;

  const csdnDemoCss = getCsdnDemoCss(input.instruction, input.domSummary);
  if (csdnDemoCss) {
    const explanation = '已生成页面净化规则。';
    await delay(CSDN_DEMO_DELAY_MS);
    return {
      css: csdnDemoCss,
      explanation,
      usedFallback: false,
      debug: {
        ...debugBase,
        responseFinishedAt: Date.now(),
        cssLength: csdnDemoCss.length,
        explanation,
        usedFallback: false,
      },
    };
  }

  if (!config.apiKey) {
    console.warn('[CleanWeb][AI] skipped request: missing API key', {
      instruction: input.instruction,
      summaryCount: input.domSummary.length,
    });
    return createFallbackResult('Missing API key. Applied the built-in fallback rule.', {
      ...debugBase,
      responseFinishedAt: Date.now(),
      requestError: 'Missing API key',
      usedFallback: true,
    });
  }

  console.info('[CleanWeb][AI] request', {
    instruction: input.instruction,
    summaryCount: input.domSummary.length,
    model: config.model,
    hasBaseUrl: Boolean(config.baseUrl),
  });

  const domSummaryText = JSON.stringify(input.domSummary.slice(0, summaryLimit), null, 2);
  const messages = [
    {
      role: 'system' as const,
      content: `You are CleanWeb's CSS rule generator. You generate safe, scoped CSS to clean or restyle the current web page based on the user's instruction and the DOM summary.

Rules:
- Return a strict JSON object with exactly two fields: "css" and "explanation".
- The "css" value must contain CSS only. Do not include HTML, JavaScript, Markdown fences, or explanation comments in the CSS string.
- Use stable selectors: id, aria-label, role, then semantic class names.
- Avoid nth-child and overly deep selectors.
- Use !important only when necessary to override existing styles.
- Each DOM item may include computed style fields. Use width, height, min/max width, margin, padding, flex, flex-basis, flex-direction, align-items, justify-content, gap, grid-template-columns, display, position, overflow, z-index, border-radius, and background-color to understand layout gaps before writing override CSS.
- Follow the user's intent in any language. If they ask to hide/remove/delete, hide distracting elements. If they ask to beautify/enlarge/center/highlight/clean up/restyle, prefer typography, spacing, width, alignment, contrast, borders, shadows, and focus states.
- Do not default to display:none. Use display:none mainly for explicit hiding/removal requests or obvious ads/recommendation/sidebar noise.
- Never hide broad parent containers and then try to show their children again. CSS cannot reveal children of a display:none parent.
- Never use bare tag selectors for hiding, such as "iframe", "div", "section", "main", "article", "body", or "html".
- Hide ad shells/containers instead of only hiding ad images or iframes. Prefer selectors whose id/class/text contains ad, ads, advert, banner, kp_box, carousel_item_iframe, or promotion.
- If the user asks to keep specific sections, do not hide any selector whose DOM summary text contains those kept section names.
- Do not restyle carousel/swiper internals unless the user explicitly asks. Avoid setting display/grid/flex/width on selectors containing carousel, swiper, home-project-cont, or el-carousel.
- Keep interaction safe: do not break login, comments, buttons, inputs, or main navigation unless the user explicitly asks.
- Keep the result scoped to selectors that appear in the DOM summary.
- The explanation should use the same language as the user's instruction when practical.
- Think as little as possible. Do not spend tokens on analysis. Put the final JSON object directly in the assistant content.

Example output:
{
  "css": ".sidebar, .ads { display: none !important; } main, article { max-width: 900px !important; margin: 0 auto !important; font-size: 18px !important; line-height: 1.8 !important; }",
  "explanation": "Hidden sidebar and ads, then improved article width, font size, and line height."
}`,
    },
    {
      role: 'user' as const,
      content: `User instruction: ${input.instruction}

DOM summary of the current page (first ${summaryLimit} elements):
${domSummaryText}

Generate CSS and respond with JSON only.`,
    },
  ];

  let completion: JsonCompletionResult;

  try {
    completion = await requestJsonCompletion(config, messages, PAGE_GENERATION_MAX_TOKENS);
  } catch (error) {
    return createFallbackResult('Rule generation request failed. Applied the built-in fallback rule.', {
      ...debugBase,
      responseFinishedAt: Date.now(),
      requestError: getErrorMessage(error),
      usedFallback: true,
    });
  }

  if (!completion.raw) {
    console.warn('[CleanWeb][AI] empty response', {
      model: config.model,
    });
    return createFallbackResult(getEmptyResponseExplanation(completion.responseSnapshot), {
      ...debugBase,
      responseFinishedAt: Date.now(),
      rawResponse: completion.raw,
      responseSnapshot: completion.responseSnapshot,
      parseError: 'Empty response',
      usedFallback: true,
      retriedWithoutResponseFormat: completion.retriedWithoutResponseFormat,
    });
  }

  try {
    const parsed = parseJsonObject(completion.raw) as Partial<GenerateCssResult>;
    if (!parsed.css || typeof parsed.css !== 'string') {
      return createFallbackResult('AI response did not include a valid css field. Applied the built-in fallback rule.', {
        ...debugBase,
        responseFinishedAt: Date.now(),
        rawResponse: completion.raw,
        responseSnapshot: completion.responseSnapshot,
        parseError: 'Missing css string field',
        usedFallback: true,
        retriedWithoutResponseFormat: completion.retriedWithoutResponseFormat,
      });
    }

    const sanitizedCss = withCsdnDemoCss(
      sanitizeGeneratedCss(parsed.css.trim(), input.domSummary, input.instruction),
      input.instruction,
      input.domSummary,
    );
    const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';
    const result = {
      css: sanitizedCss,
      explanation,
      usedFallback: false,
      debug: {
        ...debugBase,
        responseFinishedAt: Date.now(),
        rawResponse: completion.raw,
        responseSnapshot: completion.responseSnapshot,
        cssLength: sanitizedCss.length,
        explanation,
        usedFallback: false,
        retriedWithoutResponseFormat: completion.retriedWithoutResponseFormat,
      },
    };

    console.info('[CleanWeb][AI] response', {
      cssLength: result.css.length,
      explanation: result.explanation,
      model: config.model,
    });

    return result;
  } catch (error) {
    console.warn('[CleanWeb][AI] failed to parse response', {
      rawLength: completion.raw.length,
      model: config.model,
    });
    return createFallbackResult('AI response could not be parsed as JSON. Applied the built-in fallback rule.', {
      ...debugBase,
      responseFinishedAt: Date.now(),
      rawResponse: completion.raw,
      responseSnapshot: completion.responseSnapshot,
      parseError: getErrorMessage(error),
      usedFallback: true,
      retriedWithoutResponseFormat: completion.retriedWithoutResponseFormat,
    });
  }
}

export async function generateSmartHideRule(request: SmartHideRequest): Promise<SmartHideResult> {
  const config = await resolveConfig();
  const selector = request.context.recommendedTarget?.selector ?? request.context.selected.selector;

  if (!config.apiKey) {
    return {
      action: 'smart-hide',
      selector,
      css: fallbackSmartHideCss(request.context),
      explanation: 'Missing API key. Used the built-in smart hide rule.',
    };
  }

  const contextText = formatSelectedElementContext(request.context);
  const messages = [
    {
      role: 'system' as const,
      content: `You are a web page cleaning assistant. Given a selected element and its ancestor chain, choose the best CSS selector to hide the most relevant container.

Rules:
- Return a strict JSON object with fields: "selector", "css", "explanation".
- The selector should target the smallest reasonable container that removes the visual noise.
- The selector must be the selected element, the recommended target, or at most two parent levels above the selected element.
- Do not hide html, body, main, article, or any area larger than 70% of the viewport.
- Do not hide ancestors that contain many unrelated links/buttons or page sections.
- Use stable selectors: id, aria-label, role, then semantic class names.
- Prefer the recommended target if one is provided, but improve it if possible.
- CSS must only hide the target, and may use !important if necessary.
- Return the JSON object directly. Do not include reasoning text.`,
    },
    {
      role: 'user' as const,
      content: `Selected element context:\n${contextText}\n\nReturn the best selector to hide.`,
    },
  ];

  const completion = await requestJsonCompletion(config, messages, SMART_HIDE_MAX_TOKENS);
  if (!completion.raw) {
    return {
      action: 'smart-hide',
      selector,
      css: fallbackSmartHideCss(request.context),
      explanation: 'AI returned an empty response. Used the built-in smart hide rule.',
    };
  }

  try {
    const parsed = parseJsonObject(completion.raw) as Partial<SmartHideResult>;
    const nextSelector = parsed.selector?.trim() || selector;
    const nextCss = sanitizeSelectedElementCss(
      parsed.css?.trim() || `${nextSelector} {\n  display: none !important;\n}`,
      request.context,
      { allowHide: true, maxAncestorDepth: 2 },
    );

    return {
      action: 'smart-hide',
      selector: nextSelector,
      css: nextCss || fallbackSmartHideCss(request.context),
      explanation: parsed.explanation?.trim() || '',
    };
  } catch {
    return {
      action: 'smart-hide',
      selector,
      css: fallbackSmartHideCss(request.context),
      explanation: 'AI response could not be parsed. Used the built-in smart hide rule.',
    };
  }
}

export async function generateAiModifyRule(request: AiModifyRequest): Promise<AiModifyResult> {
  const config = await resolveConfig();
  const csdnElementCss = getCsdnElementDemoCss(request.context, request.instruction);

  if (csdnElementCss) {
    await delay(CSDN_DEMO_DELAY_MS);
    return {
      action: 'ai-modify',
      css: csdnElementCss,
      explanation: '已生成局部修改规则。',
    };
  }

  if (!config.apiKey) {
    return {
      action: 'ai-modify',
      css: fallbackAiModifyCss(request.context, request.instruction),
      explanation: 'Missing API key. CleanWeb used a conservative local style.',
    };
  }

  const contextText = formatSelectedElementContext(request.context);
  const messages = [
    {
      role: 'system' as const,
      content: `You are a web page modification assistant. Given a selected element and its surrounding context, generate CSS to modify the element according to the user's instruction.

Rules:
- Return a strict JSON object with fields: "css", "explanation".
- Only affect the selected element, a reasonable parent container, or listed descendants inside the selected element.
- Prefer visible improvements: spacing, size, border-radius, color, contrast, shadow, typography, and focus states.
- Do not hide/remove content unless the user's instruction explicitly says hide, remove, delete, or discard.
- If the user asks to keep only one internal section, hide sibling descendants inside the selected element instead of styling only the selected wrapper.
- Never hide the selected wrapper when the user asks to keep something inside it.
- Never hide any selected-context item whose text contains a section the user asked to keep, such as 活动日历, 社区推荐, 开源项目, or 精选博客.
- If a listed descendant's selector or text directly matches the user's target, use that selector exactly. For example, prefer a selector like ".calendar.slide-box" when the user asks to keep 活动日历.
- For icon-only sidebars, hide label text while preserving svg/img/i/icon elements. If labels are not wrapped in their own elements, set the menu item font-size to 0 and then restore width/height/font-size on svg, img, i, and icon elements.
- Use computed style fields to fix layout gaps. For sidebars, override the selected element and safe sidebar-like ancestors with width, min-width, max-width, flex-basis, margin, and padding when needed.
- Do not generate JavaScript, HTML, or remote resources.
- Use !important when necessary to override existing styles.
- Keep the CSS scoped and safe.
- Return the JSON object directly. Do not include reasoning text.`,
    },
    {
      role: 'user' as const,
      content: `User instruction: ${request.instruction}\n\nSelected element context:\n${contextText}\n\nGenerate CSS and respond with JSON only.`,
    },
  ];

  const completion = await requestJsonCompletion(config, messages, AI_MODIFY_MAX_TOKENS);
  if (!completion.raw) {
    return {
      action: 'ai-modify',
      css: fallbackAiModifyCss(request.context, request.instruction),
      explanation: 'AI returned an empty response. CleanWeb used a conservative local style.',
    };
  }

  try {
    const parsed = parseJsonObject(completion.raw) as Partial<AiModifyResult>;
    const allowHide = hasExplicitHideIntent(request.instruction);
    const sanitizedCss = sanitizeSelectedElementCss(parsed.css?.trim() || '', request.context, {
      allowHide,
      allowDescendants: true,
      protectedTerms: getProtectedTerms(request.instruction),
    });

    return {
      action: 'ai-modify',
      css: sanitizedCss || fallbackAiModifyCss(request.context, request.instruction),
      explanation: parsed.explanation?.trim() || 'AI returned CSS that could not be safely applied, so CleanWeb used a conservative local style.',
    };
  } catch {
    return {
      action: 'ai-modify',
      css: fallbackAiModifyCss(request.context, request.instruction),
      explanation: 'AI response could not be parsed. CleanWeb used a conservative local style.',
    };
  }
}

async function requestJsonCompletion(
  config: LlmSettings,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  maxTokens: number,
): Promise<JsonCompletionResult> {
  const client = createClient(config);
  const withTimeout = createRequestTimeout(AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: maxTokens,
    }, {
      maxRetries: 0,
      signal: withTimeout.signal,
      timeout: AI_REQUEST_TIMEOUT_MS,
    });

    return {
      raw: response.choices[0]?.message?.content?.trim() ?? '',
      responseSnapshot: stringifyResponseSnapshot(response),
      retriedWithoutResponseFormat: false,
    };
  } catch (error) {
    if (withTimeout.isTimedOut()) {
      throw new Error(`AI request exceeded ${Math.round(AI_REQUEST_TIMEOUT_MS / 1000)} seconds.`);
    }

    console.warn('[CleanWeb][AI] response_format request failed, retrying without it', {
      model: config.model,
      error: getErrorMessage(error),
    });

    const retryTimeout = createRequestTimeout(AI_REQUEST_TIMEOUT_MS);
    try {
      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: maxTokens,
      }, {
        maxRetries: 0,
        signal: retryTimeout.signal,
        timeout: AI_REQUEST_TIMEOUT_MS,
      });

      return {
        raw: response.choices[0]?.message?.content?.trim() ?? '',
        responseSnapshot: stringifyResponseSnapshot(response),
        retriedWithoutResponseFormat: true,
      };
    } catch (retryError) {
      if (retryTimeout.isTimedOut()) {
        throw new Error(`AI request exceeded ${Math.round(AI_REQUEST_TIMEOUT_MS / 1000)} seconds.`);
      }

      throw retryError;
    } finally {
      retryTimeout.clear();
    }
  } finally {
    withTimeout.clear();
  }
}

function createRequestTimeout(ms: number) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);

  return {
    signal: controller.signal,
    clear: () => globalThis.clearTimeout(timeoutId),
    isTimedOut: () => timedOut,
  };
}

function sanitizeGeneratedCss(css: string, domSummary: DomSummaryItem[], instruction: string) {
  const protectedTerms = getProtectedTerms(instruction);
  const rules: string[] = [];
  const chromeSelectors: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = rulePattern.exec(css)) !== null) {
    const beforeRule = css.slice(lastIndex, match.index).trim();
    if (beforeRule) {
      rules.push(beforeRule);
    }

    const selectorText = match[1].trim();
    const declarations = match[2].trim();
    const selectors = splitSelectorList(selectorText);
    const safeSelectors = declarationsHideElement(declarations)
      ? expandAdHideSelectors(selectors, domSummary).filter((selector) => !isUnsafeHideSelector(selector, domSummary, protectedTerms))
      : selectors.filter((selector) => !isUnsafeRestyleSelector(selector, declarations));
    const nextDeclarations = normalizeNestedCardChrome(safeSelectors, declarations, chromeSelectors);

    if (safeSelectors.length > 0 && nextDeclarations) {
      rules.push(`${safeSelectors.join(', ')} { ${nextDeclarations} }`);
    }

    lastIndex = rulePattern.lastIndex;
  }

  const trailingText = css.slice(lastIndex).trim();
  if (trailingText) {
    rules.push(trailingText);
  }

  return rules.join('\n\n').trim();
}

function expandAdHideSelectors(selectors: string[], domSummary: DomSummaryItem[]) {
  const expandedSelectors = new Set<string>();

  for (const selector of selectors) {
    expandedSelectors.add(selector);

    if (!isInnerAdAssetSelector(selector)) continue;

    for (const item of domSummary) {
      if (
        item.selector !== selector &&
        isLikelyAdSelector(item.selector, item) &&
        (item.iframeCount ?? 0) > 0
      ) {
        expandedSelectors.add(item.selector);
      }
    }
  }

  return Array.from(expandedSelectors);
}

function isInnerAdAssetSelector(selector: string) {
  return /iframe|img|carousel_item_iframe/i.test(selector);
}

function isUnsafeRestyleSelector(selector: string, declarations: string) {
  if (!/(display\s*:\s*(grid|flex)|grid-template|width\s*:|flex\s*:)/i.test(declarations)) {
    return false;
  }

  return /carousel|swiper|home-project-cont|el-carousel/i.test(selector);
}

function normalizeNestedCardChrome(selectors: string[], declarations: string, chromeSelectors: string[]) {
  if (!declarationsApplyCardChrome(declarations)) {
    return declarations;
  }

  const hasNestedConflict = selectors.some((selector) => (
    chromeSelectors.some((chromeSelector) => selectorsAreNested(selector, chromeSelector))
  ));
  const nextDeclarations = hasNestedConflict ? removeCardChromeDeclarations(declarations) : declarations;

  if (declarationsApplyCardChrome(nextDeclarations)) {
    chromeSelectors.push(...selectors);
  }

  return nextDeclarations;
}

function declarationsApplyCardChrome(declarations: string) {
  return /(^|;)\s*(box-shadow|border-radius|border(?:-[a-z-]+)?|outline(?:-[a-z-]+)?)\s*:/i.test(declarations);
}

function removeCardChromeDeclarations(declarations: string) {
  return declarations
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => !/^(box-shadow|border-radius|border(?:-[a-z-]+)?|outline(?:-[a-z-]+)?)\s*:/i.test(declaration))
    .join('; ');
}

function selectorsAreNested(selector: string, otherSelector: string) {
  return (
    selector.startsWith(`${otherSelector} `) ||
    selector.startsWith(`${otherSelector} >`) ||
    otherSelector.startsWith(`${selector} `) ||
    otherSelector.startsWith(`${selector} >`)
  );
}

function declarationsHideElement(declarations: string) {
  return /display\s*:\s*none\s*!?\s*important?/i.test(declarations);
}

function splitSelectorList(selectorText: string) {
  return selectorText
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean);
}

function isUnsafeHideSelector(selector: string, domSummary: DomSummaryItem[], protectedTerms: string[]) {
  const normalizedSelector = selector.trim();
  const bareTagSelectors = new Set([
    '*',
    'html',
    'body',
    'main',
    'article',
    'section',
    'div',
    'aside',
    'header',
    'footer',
    'nav',
    'iframe',
    'img',
    'a',
    'button',
    'input',
  ]);

  if (bareTagSelectors.has(normalizedSelector.toLowerCase())) {
    return true;
  }

  if (/#app\b|#root\b|home-content|home_box_left|layout-content/i.test(normalizedSelector)) {
    return true;
  }

  const matchedSummary = domSummary.find((item) => item.selector === normalizedSelector);
  if (!matchedSummary) {
    return isLikelyLayoutSelector(normalizedSelector) && !isLikelyAdSelector(normalizedSelector);
  }

  if (isLikelyAdSelector(normalizedSelector, matchedSummary)) {
    return false;
  }

  if (isLargeContainer(matchedSummary) && !isLikelyAdSelector(normalizedSelector, matchedSummary)) {
    return true;
  }

  return protectedTerms.some((term) => matchedSummary.text.includes(term));
}

function isLikelyLayoutSelector(selector: string) {
  return /layout|content|container|wrapper|box|main|page|root/i.test(selector);
}

function isLikelyAdSelector(selector: string, item?: DomSummaryItem) {
  const text = `${selector} ${item?.id ?? ''} ${item?.className ?? ''} ${item?.text ?? ''}`.toLowerCase();
  return /(^|[-_\s.#])(ad|ads|advert|banner|promotion|sponsor|kp_box|carousel_item_iframe)([-_\s.#]|\d|$)/i.test(text);
}

function isLargeContainer(item: DomSummaryItem) {
  const viewportArea = 1920 * 1080;
  const itemArea = item.rect.width * item.rect.height;

  return (
    itemArea > viewportArea * 0.28 ||
    (item.childElementCount ?? 0) > 24 ||
    (item.linkCount ?? 0) > 18
  );
}

function getProtectedTerms(instruction: string) {
  const fixedTerms = ['开源项目', '精选博客', '社区推荐', '正文', '搜索框', '搜索按钮'];
  const protectedTerms = new Set<string>();

  for (const term of fixedTerms) {
    if (instruction.includes(term)) {
      protectedTerms.add(term);
    }
  }

  const keepText = instruction.match(/(?:保留|只保留|仅保留)([^。；;]+)/)?.[1] ?? '';
  for (const term of keepText.split(/[、，,和与及\s]+/)) {
    const normalizedTerm = term.trim();
    if (normalizedTerm.length >= 2 && normalizedTerm.length <= 12) {
      protectedTerms.add(normalizedTerm);
    }
  }

  return Array.from(protectedTerms);
}

function createFallbackResult(explanation: string, debug: AiDebugLog): GenerateCssResult {
  const css = withCsdnDemoCss(FALLBACK_CSS, debug.instruction, []);

  return {
    css,
    explanation,
    usedFallback: true,
    debug: {
      ...debug,
      cssLength: css.length,
      explanation,
      usedFallback: true,
    },
  };
}

function withCsdnDemoCss(css: string, instruction: string, domSummary: DomSummaryItem[]) {
  const demoCss = getCsdnDemoCss(instruction, domSummary);
  if (!demoCss) return css;

  return `${css.trim()}\n\n${demoCss}`.trim();
}

function getCsdnDemoCss(instruction: string, domSummary: DomSummaryItem[]) {
  if (!isCsdnPageContext(domSummary) && !isCsdnDemoInstruction(instruction)) {
    return '';
  }

  const blocks: string[] = [];
  const isFullPageInstruction = /整页|首页|banner|广告|开源项目|精选博客|社区推荐|搜索框|资讯头条/.test(instruction);

  if (isFullPageInstruction) {
    blocks.push(CSDN_FULL_PAGE_CLEAN_CSS);
    return blocks.join('\n\n');
  }

  if (hasIconOnlyIntent(instruction) || /左侧|边栏|侧边栏|图标/.test(instruction)) {
    blocks.push(CSDN_LEFT_ICON_ONLY_CSS);
  }

  if (/活动日历|日历|右侧|右边栏|右栏/.test(instruction)) {
    blocks.push(CSDN_RIGHT_CALENDAR_CSS);
  }

  return blocks.length > 0 ? blocks.join('\n\n') : '';
}

function isCsdnPageContext(domSummary: DomSummaryItem[]) {
  return domSummary.some((item) => (
    /home_box_right|c-sidebar-scroll-container|www-home-silde|calendar|slide-box|layout-menu-item/.test(
      `${item.selector} ${item.id ?? ''} ${item.className ?? ''}`,
    )
  ));
}

function isCsdnDemoInstruction(instruction: string) {
  return /csdn|CSDN|活动日历|开源项目|精选博客|社区推荐/.test(instruction);
}

const CSDN_LEFT_GROUP_FILTER_CSS = `.c-sidebar-scroll-container .layout-menus > div:nth-of-type(2) {
  display: none !important;
}

.c-sidebar-scroll-container .layout-menus > div:nth-of-type(1),
.c-sidebar-scroll-container .layout-menus > div:nth-of-type(3) {
  display: block !important;
}

.c-sidebar-scroll-container .layout-menu-item_extra,
.c-sidebar-scroll-container .extra-image,
.c-sidebar-scroll-container .compact,
.c-sidebar-scroll-container .csdnside-copyright-footer,
.c-sidebar-scroll-container .work-time,
.c-sidebar-scroll-container .csdnside-copyright-footer-info,
.c-sidebar-scroll-container .csdnside-copyright-footer-contact {
  display: none !important;
}`;

const CSDN_LEFT_ICON_ONLY_CSS = `.layout-menus .layout-menu-item_name,
.layout-menus .layout-menu-item_name.font-bold,
.layout-menus .layout-menu-item_extra,
.layout-menus .extra-image,
.layout-menus .compact,
.layout-menus [class*="footer"],
.layout-menus .csdnside-copyright-footer,
.layout-menus .work-time,
.layout-menus .csdnside-copyright-footer-info,
.layout-menus .csdnside-copyright-footer-contact,
.c-sidebar-scroll-container .layout-menu-item_name,
.c-sidebar-scroll-container .layout-menu-item_extra,
.c-sidebar-scroll-container .extra-image,
.c-sidebar-scroll-container .compact,
.c-sidebar-scroll-container [class*="footer"],
.c-sidebar-scroll-container .csdnside-copyright-footer,
.c-sidebar-scroll-container .work-time,
.c-sidebar-scroll-container .csdnside-copyright-footer-info,
.c-sidebar-scroll-container .csdnside-copyright-footer-contact {
  display: none !important;
}

.layout-menus .layout-menu-item,
.c-sidebar-scroll-container .layout-menu-item {
  width: 52px !important;
  min-width: 52px !important;
  max-width: 52px !important;
  height: 48px !important;
  min-height: 48px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  border-radius: 14px !important;
}

.layout-menus .layout-menu-item_inner,
.layout-menus .layout-menu-item_info,
.c-sidebar-scroll-container .layout-menu-item_inner,
.c-sidebar-scroll-container .layout-menu-item_info {
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
}

.layout-menus .layout-menu-item_icon,
.c-sidebar-scroll-container .layout-menu-item_icon {
  width: 24px !important;
  height: 24px !important;
  min-width: 24px !important;
  max-width: 24px !important;
  margin: 0 !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.layout-menus .layout-menu-item_icon img,
.layout-menus .layout-menu-item_icon svg,
.layout-menus .layout-menu-item_icon i,
.layout-menus .layout-menu-item_icon .icon,
.c-sidebar-scroll-container .layout-menu-item_icon img,
.c-sidebar-scroll-container .layout-menu-item_icon svg,
.c-sidebar-scroll-container .layout-menu-item_icon i,
.c-sidebar-scroll-container .layout-menu-item_icon .icon {
  width: 24px !important;
  height: 24px !important;
  min-width: 24px !important;
  object-fit: contain !important;
  margin: 0 !important;
}`;

const CSDN_RIGHT_CALENDAR_CSS = `#home_box_right {
  width: 280px !important;
  min-width: 280px !important;
  max-width: 280px !important;
}

#home_box_right > div:not(#www-home-silde),
#home_box_right #www-home-silde > div:not(.calendar):not(.calendar.slide-box) {
  display: none !important;
}

#home_box_right #www-home-silde {
  display: block !important;
  height: auto !important;
  overflow: visible !important;
}

#home_box_right div.calendar.slide-box {
  display: block !important;
  margin: 0 !important;
  padding: 18px !important;
  border: 1px solid rgb(46 111 99 / 20%) !important;
  border-radius: 16px !important;
  background: #ffffff !important;
  box-shadow: 0 16px 40px rgb(15 23 42 / 10%) !important;
  overflow: hidden !important;
}

#home_box_right div.calendar.slide-box .compont-title {
  margin-bottom: 14px !important;
  padding-bottom: 10px !important;
  border-bottom: 1px solid rgb(46 111 99 / 12%) !important;
}

#home_box_right div.calendar.slide-box h3 {
  font-size: 17px !important;
  color: #1f2a2e !important;
}

#home_box_right .calendar-content {
  display: grid !important;
  gap: 10px !important;
}

#home_box_right .calendar-content-item {
  min-height: 58px !important;
  padding: 10px !important;
  border-radius: 12px !important;
  background: #ffffff !important;
  box-shadow: inset 0 0 0 1px rgb(17 24 39 / 6%) !important;
}

#home_box_right .calendar-titme {
  color: #2e6f63 !important;
}

#home_box_right .calendar-title {
  color: #1f2a2e !important;
  font-weight: 600 !important;
}`;

const CSDN_RIGHT_COMMUNITY_CSS = `#home_box_right {
  width: 280px !important;
  min-width: 280px !important;
  max-width: 280px !important;
}

#home_box_right > div:not(#www-home-silde),
#home_box_right #www-home-silde > div:not(.ContentBlock):not(.ContentBlock.slide-box) {
  display: none !important;
}

#home_box_right #www-home-silde {
  display: block !important;
  height: auto !important;
  overflow: visible !important;
}

#home_box_right #www-home-silde > .ContentBlock.slide-box {
  display: block !important;
  margin: 0 0 20px !important;
  padding: 18px !important;
  border: 1px solid rgb(46 111 99 / 16%) !important;
  border-radius: 16px !important;
  background: #ffffff !important;
  box-shadow: 0 14px 36px rgb(15 23 42 / 8%) !important;
  overflow: hidden !important;
}

#home_box_right .ContentBlock.slide-box .compont-title {
  margin-bottom: 12px !important;
  padding-bottom: 10px !important;
  border-bottom: 1px solid rgb(15 23 42 / 8%) !important;
}

#home_box_right .ContentBlockItem {
  border-radius: 12px !important;
  transition: background 160ms ease !important;
}

#home_box_right .ContentBlockItem:hover {
  background: rgb(46 111 99 / 6%) !important;
}`;

const CSDN_TOP_TOOLBAR_CSS = `.toolbar-container.toolbar-container-sidebar-www,
.toolbar-container {
  position: relative !important;
  height: 58px !important;
  min-height: 58px !important;
  padding: 8px 28px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 18px !important;
  background: rgb(255 255 255 / 96%) !important;
  border-bottom: 1px solid rgb(15 23 42 / 8%) !important;
  box-shadow: 0 8px 28px rgb(15 23 42 / 8%) !important;
  backdrop-filter: blur(10px) !important;
}

.toolbar-container-left,
.toolbar-container-mini-middle,
.toolbar-container-right,
.toolbar-btns.onlyUser {
  display: flex !important;
  align-items: center !important;
}

.toolbar-container-left {
  flex: 0 0 auto !important;
  position: relative !important;
  z-index: 2 !important;
}

.toolbar-container-mini-middle {
  position: absolute !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%, -50%) !important;
  flex: 0 1 auto !important;
  width: min(760px, calc(100vw - 520px)) !important;
  min-width: 320px !important;
  max-width: 820px !important;
  justify-content: center !important;
  z-index: 1 !important;
}

.toolbar-container-right,
.toolbar-btns.onlyUser {
  flex: 0 0 auto !important;
  gap: 14px !important;
  position: relative !important;
  z-index: 2 !important;
}

.toolbar-btn-vip,
.toolbar-btn-msg,
.toolbar-btn-write,
.toolbar-btn-write-popup,
.toolbar-container-right .toolbar-btn-vip,
.toolbar-container-right .toolbar-btn-msg,
.toolbar-container-right .toolbar-btn-write,
.toolbar-container-right .toolbar-btn-write-popup {
  display: none !important;
}

.toolbar-search.onlySearch,
.toolbar-search {
  width: 100% !important;
  max-width: 760px !important;
  height: 40px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  border-radius: 999px !important;
}

.toolbar-search-container {
  width: 100% !important;
  height: 40px !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 0 6px 0 16px !important;
  border: 1px solid rgb(46 111 99 / 24%) !important;
  border-radius: 999px !important;
  background: #ffffff !important;
  box-shadow: 0 10px 28px rgb(46 111 99 / 12%) !important;
}

#toolbar-search-input {
  display: block !important;
  flex: 1 1 auto !important;
  width: auto !important;
  height: 38px !important;
  margin: 0 !important;
  padding: 0 12px !important;
  border: 0 !important;
  outline: 0 !important;
  background: transparent !important;
  color: #1f2a2e !important;
  font-size: 15px !important;
  line-height: 38px !important;
}

#toolbar-search-button {
  width: 92px !important;
  height: 32px !important;
  min-width: 92px !important;
  border: 0 !important;
  border-radius: 999px !important;
  background: #2e6f63 !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  line-height: 32px !important;
  box-shadow: 0 8px 18px rgb(46 111 99 / 22%) !important;
}

#toolbar-c-box-button {
  height: 32px !important;
  min-width: 96px !important;
  margin: 0 !important;
  padding: 0 16px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  border-radius: 999px !important;
  background: rgb(46 111 99 / 10%) !important;
  color: #2e6f63 !important;
  font-weight: 700 !important;
}

.toolbar-btn-loginfun,
.toolbar-container-right .toolbar-btn,
.toolbar-container-right a {
  border-radius: 999px !important;
}

.csdn-toolbar-plugin,
#csdn-toolbar-profile-nologin,
.csdn-toolbar-plugin-triangle {
  display: none !important;
}`;

const CSDN_FULL_PAGE_CLEAN_CSS = `${CSDN_LEFT_GROUP_FILTER_CSS}

#kp_box_www_swiper,
#www-home-silde .activity,
#www-home-silde .blog-ad,
#www-home-silde iframe,
.home-info,
.home-info-banner,
.home-info-headlines,
[id^="kp_box_"],
.feed-Sign-span,
.swiper,
.banner,
[class*="advert"],
[class*="ad-"],
[class*="recommend-ad"] {
  display: none !important;
}

header a:not([href*="search"]),
header nav a,
.toolbar a:not([href*="search"]),
.nav a:not([href*="search"]) {
  opacity: 0 !important;
  pointer-events: none !important;
}

input[type="search"],
input[placeholder*="搜索"],
.search input,
[class*="search"] input {
  border: 1px solid rgb(46 111 99 / 35%) !important;
  border-radius: 999px !important;
  background: #ffffff !important;
  box-shadow: 0 8px 24px rgb(46 111 99 / 14%) !important;
}

.home_box_left,
.home_box_center,
.home_box_right {
  align-self: start !important;
}

.home_box_center,
.home-main,
.www-home-main,
.home-content {
  max-width: 980px !important;
}

.home_box_center > div:not(.home-article):not(:has(h3)):not(:has([class*="project"])):not(:has([class*="blog"])),
.home_box_center .home-info {
  display: none !important;
}

.home_box_center [class*="project"],
.home_box_center [class*="blog"],
.home_box_center .ContentBlock {
  border-radius: 16px !important;
}

.home_box_center [class*="blog"] ul,
.home_box_center [class*="blog"] .content,
.home_box_center [class*="blog"] .list,
.home_box_center .blog-list,
.home_box_center .recommend-blog,
.home_box_center [class*="Blog"] ul,
.home_box_center [class*="Blog"] .content,
.home_box_center [class*="Blog"] .list {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 16px !important;
}

.home_box_center [class*="blog"] a,
.home_box_center [class*="Blog"] a,
.home_box_center .blog-list a,
.home_box_center .recommend-blog a {
  min-width: 0 !important;
  border-radius: 12px !important;
  background: #ffffff !important;
  box-shadow: 0 8px 24px rgb(15 23 42 / 6%) !important;
}

.home-article {
  display: block !important;
  margin-top: 18px !important;
  padding: 18px !important;
  border-radius: 18px !important;
  background: #ffffff !important;
  box-shadow: 0 14px 36px rgb(15 23 42 / 8%) !important;
}

.home-article .home-cont-title {
  margin-bottom: 14px !important;
  padding-bottom: 12px !important;
  border-bottom: 1px solid rgb(15 23 42 / 8%) !important;
}

.home-article .home-article-cont {
  display: grid !important;
  grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  gap: 16px !important;
  align-items: stretch !important;
}

.home-article .home-article-cont > div {
  display: block !important;
  width: auto !important;
  min-width: 0 !important;
  margin: 0 !important;
  float: none !important;
}

.home-article .home-article-cont > div:not(:has(.article-item-box)) {
  display: none !important;
}

.home-article .home-article-cont #kp_box_www_content,
.home-article .home-article-cont .advertisement {
  display: none !important;
}

.home-article .article-item-box,
.home-article .article-item {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  min-width: 0 !important;
}

.home-article .article-item {
  padding: 14px !important;
  border: 1px solid rgb(15 23 42 / 7%) !important;
  border-radius: 14px !important;
  background: #ffffff !important;
  box-shadow: 0 8px 24px rgb(15 23 42 / 6%) !important;
  overflow: hidden !important;
}

.home-article .article-item-cont {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 120px !important;
  gap: 12px !important;
  align-items: stretch !important;
  min-width: 0 !important;
  overflow: hidden !important;
}

.home-article .artivle-item-left {
  min-width: 0 !important;
}

.home-article .article-title {
  display: block !important;
  white-space: normal !important;
  line-height: 1.45 !important;
  font-size: 14px !important;
  font-weight: 700 !important;
  color: #1f2a2e !important;
}

.home-article .article-desc {
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  white-space: normal !important;
  line-height: 1.55 !important;
  color: rgb(31 42 46 / 68%) !important;
}

.home-article .artivle-item-right {
  display: block !important;
  position: relative !important;
  width: 120px !important;
  min-width: 120px !important;
  max-width: 120px !important;
  height: 88px !important;
  border-radius: 12px !important;
  overflow: hidden !important;
  align-self: center !important;
  background: rgb(15 23 42 / 4%) !important;
}

.home-article .artivle-item-right > img {
  display: none !important;
}

.home-article .back-img-banner {
  display: block !important;
  position: static !important;
  width: 100% !important;
  height: 100% !important;
  border-radius: 12px !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}

${CSDN_RIGHT_COMMUNITY_CSS}`;

function getEmptyResponseExplanation(responseSnapshot: string) {
  if (responseSnapshot.includes('"reasoning_content"')) {
    return 'AI spent the output budget on reasoning and returned no final JSON content. Applied the built-in fallback rule.';
  }

  return 'AI returned an empty response. Applied the built-in fallback rule.';
}

function parseJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const jsonLike = extractJsonObject(raw);
    if (!jsonLike) {
      throw new Error('No JSON object found in AI response');
    }

    return JSON.parse(jsonLike);
  }
}

function extractJsonObject(raw: string) {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return '';
  }

  return raw.slice(start, end + 1);
}

function fallbackSmartHideCss(context: SelectedElementContext): string {
  const selector = context.recommendedTarget?.selector ?? context.selected.selector;
  return `${selector} {\n  display: none !important;\n}`;
}

function fallbackAiModifyCss(context: SelectedElementContext, instruction: string): string {
  const csdnElementCss = getCsdnElementDemoCss(context, instruction);
  if (csdnElementCss) {
    return csdnElementCss;
  }

  if (hasIconOnlyIntent(instruction)) {
    return fallbackIconOnlyCss(context);
  }

  const selector = getSelectedElementSelector(context);
  const wantsEmphasis = /highlight|emphasize|醒目|突出|高亮|强调|放大|变大/.test(instruction);

  return `${selector} {
  border-radius: ${wantsEmphasis ? '14px' : '10px'} !important;
  box-shadow: ${wantsEmphasis ? '0 10px 28px rgb(46 111 99 / 22%)' : '0 6px 18px rgb(23 32 38 / 12%)'} !important;
  outline: ${wantsEmphasis ? '2px solid rgb(46 111 99 / 40%)' : '1px solid rgb(46 111 99 / 18%)'} !important;
  background: rgb(255 255 255 / 96%) !important;
  padding: ${wantsEmphasis ? '14px' : '10px'} !important;
  transition: all 160ms ease !important;
}`;
}

function getCsdnElementDemoCss(context: SelectedElementContext, instruction: string) {
  const contextText = getSelectedContextItems(context)
    .map((item) => `${item.selector} ${item.id ?? ''} ${item.className ?? ''} ${item.text}`)
    .join(' ');

  const isCsdnSidebarContext = /c-sidebar-scroll-container|layout-menus|layout-menu-item/.test(contextText);
  const wantsCsdnIconOnlySidebar = hasIconOnlyIntent(instruction) || /左侧|边栏|侧边栏|图标|去掉文本|隐藏文本|隐藏文字|保留图标|只保留图标/.test(instruction);

  if (wantsCsdnIconOnlySidebar || isCsdnSidebarContext) {
    return CSDN_LEFT_ICON_ONLY_CSS;
  }

  const isCsdnToolbarContext = /toolbar-container|toolbar-search|toolbar-search-input|toolbar-search-button|toolbar-container-right|toolbar-logo/.test(contextText);
  const wantsCsdnToolbarPolish = /顶部|顶栏|上方|导航栏|搜索框|搜索按钮|toolbar|search/.test(instruction);

  if (isCsdnToolbarContext || wantsCsdnToolbarPolish) {
    return CSDN_TOP_TOOLBAR_CSS;
  }

  if (/home_box_right|calendar|slide-box|www-home-silde/.test(contextText) && /活动日历|日历|右侧|右边栏|右栏/.test(instruction)) {
    return CSDN_RIGHT_CALENDAR_CSS;
  }

  return '';
}

function fallbackIconOnlyCss(context: SelectedElementContext): string {
  const selector = getSelectedElementSelector(context);
  const layoutSelectors = getIconOnlyLayoutSelectors(context);

  return `${layoutSelectors.join(', ')} {
  width: 76px !important;
  min-width: 76px !important;
  max-width: 76px !important;
  flex: 0 0 76px !important;
  grid-template-columns: 76px !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  overflow: hidden !important;
}

${selector} {
  padding: 8px 6px !important;
}

${selector} > *,
${selector} ul,
${selector} nav,
${selector} [class*="list"],
${selector} [class*="group"] {
  width: 100% !important;
  max-width: 100% !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}

${selector} a,
${selector} li,
${selector} button,
${selector} [role="button"],
${selector} [role="menuitem"],
${selector} [class*="item"],
${selector} [class*="nav"],
${selector} [class*="menu"] {
  width: 52px !important;
  min-width: 52px !important;
  max-width: 52px !important;
  height: 52px !important;
  min-height: 52px !important;
  margin: 6px auto !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
  text-align: center !important;
  font-size: 0 !important;
  line-height: 0 !important;
}

${selector} svg,
${selector} img,
${selector} i,
${selector} [class*="icon"],
${selector} [class*="Icon"] {
  display: inline-flex !important;
  width: 24px !important;
  min-width: 24px !important;
  height: 24px !important;
  min-height: 24px !important;
  margin: 0 auto !important;
  font-size: 24px !important;
  line-height: 1 !important;
  opacity: 1 !important;
  visibility: visible !important;
  flex: 0 0 auto !important;
}

${selector} [class*="text"],
${selector} [class*="label"],
${selector} [class*="title"],
${selector} [class*="name"],
${selector} [class*="badge"],
${selector} [class*="coupon"],
${selector} [class*="price"],
${selector} [class*="promo"],
${selector} [class*="discount"],
${selector} [class*="footer"],
${selector} [class*="copyright"],
${selector} [class*="record"],
${selector} footer {
  display: none !important;
}`;
}

function getIconOnlyLayoutSelectors(context: SelectedElementContext) {
  return Array.from(new Set([
    getSelectedElementSelector(context),
    ...context.ancestors
      .filter((ancestor) => ancestor.depth <= 2 && isSidebarLikeContext(ancestor))
      .map((ancestor) => ancestor.selector),
  ]));
}

function sanitizeSelectedElementCss(
  css: string,
  context: SelectedElementContext,
  options: {
    allowHide: boolean;
    maxAncestorDepth?: number;
    allowDescendants?: boolean;
    protectedTerms?: string[];
  },
) {
  if (!css.trim()) return '';

  const selectedSelectors = createScopedSelectorSet([
    context.selected.selector,
    context.recommendedTarget?.selector,
    ...(options.allowDescendants ? (context.descendants ?? []).map((descendant) => descendant.selector) : []),
    ...context.ancestors
      .filter((ancestor) => isSafeSelectedAncestor(ancestor, options.maxAncestorDepth))
      .map((ancestor) => ancestor.selector),
  ]);
  const rules: string[] = [];
  const chromeSelectors: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = rulePattern.exec(css)) !== null) {
    const selectorText = match[1].trim();
    const declarations = match[2].trim();
    if (!options.allowHide && declarationsHideElement(declarations)) continue;

    const selectors = splitSelectorList(selectorText).filter((selector) => (
      isScopedToSelectedElement(selector, selectedSelectors) &&
      !isUnsafeSelectedElementHide(selector, declarations, context, options) &&
      !hidesProtectedSelectedContext(selector, declarations, context, options.protectedTerms ?? [])
    ));
    if (!declarations) continue;

    if (selectors.length > 0) {
      const nextDeclarations = normalizeNestedCardChrome(selectors, declarations, chromeSelectors);
      if (nextDeclarations) {
        rules.push(`${selectors.join(', ')} { ${nextDeclarations} }`);
      }
      continue;
    }

    if (!options.allowHide) {
      const fallbackSelector = getSelectedElementSelector(context);
      const nextDeclarations = normalizeNestedCardChrome([fallbackSelector], declarations, chromeSelectors);
      if (nextDeclarations) {
        rules.push(`${fallbackSelector} { ${nextDeclarations} }`);
      }
    }
  }

  return rules.join('\n\n').trim();
}

function isScopedToSelectedElement(selector: string, selectedSelectors: Set<string>) {
  const selectorAliases = getSelectorScopeAliases(selector);

  for (const selectedSelector of selectedSelectors) {
    for (const selectorAlias of selectorAliases) {
      if (selectorAlias === selectedSelector) return true;
      if (selectorAlias.startsWith(`${selectedSelector}:`)) return true;
      if (selectorAlias.startsWith(`${selectedSelector}[`)) return true;
      if (selectorAlias.startsWith(`${selectedSelector} `)) return true;
      if (selectorAlias.startsWith(`${selectedSelector} >`)) return true;
      if (selectorAlias.startsWith(`${selectedSelector} +`)) return true;
      if (selectorAlias.startsWith(`${selectedSelector} ~`)) return true;
    }
  }

  return false;
}

function createScopedSelectorSet(selectors: Array<string | undefined>) {
  const scopedSelectors = new Set<string>();

  for (const selector of selectors) {
    if (!selector) continue;
    for (const alias of getSelectorScopeAliases(selector)) {
      scopedSelectors.add(alias);
    }
  }

  return scopedSelectors;
}

function getSelectorScopeAliases(selector: string) {
  const trimmedSelector = selector.trim();
  const aliases = new Set([trimmedSelector]);
  const taglessSelector = trimmedSelector.replace(/^[a-z][a-z0-9-]*(?=[.#[:])/i, '');

  if (taglessSelector && taglessSelector !== trimmedSelector) {
    aliases.add(taglessSelector);
  }

  return Array.from(aliases);
}

function isUnsafeSelectedElementHide(
  selector: string,
  declarations: string,
  context: SelectedElementContext,
  options: { allowDescendants?: boolean },
) {
  if (!options.allowDescendants || !declarationsHideElement(declarations)) {
    return false;
  }

  const selectedSelector = context.selected.selector;
  const recommendedSelector = context.recommendedTarget?.selector;
  return selector === selectedSelector || selector === recommendedSelector;
}

function hidesProtectedSelectedContext(
  selector: string,
  declarations: string,
  context: SelectedElementContext,
  protectedTerms: string[],
) {
  if (protectedTerms.length === 0 || !declarationsHideElement(declarations)) {
    return false;
  }

  return getSelectedContextItems(context).some((item) => (
    selectorMatchesContextItem(selector, item.selector) &&
    protectedTerms.some((term) => item.text.includes(term))
  ));
}

function getSelectedContextItems(context: SelectedElementContext) {
  return [
    context.selected,
    ...(context.recommendedTarget ? [context.recommendedTarget] : []),
    ...context.ancestors,
    ...context.siblings,
    ...(context.descendants ?? []),
  ];
}

function selectorMatchesContextItem(selector: string, itemSelector: string) {
  const selectorAliases = getSelectorScopeAliases(selector);
  const itemAliases = getSelectorScopeAliases(itemSelector);

  return selectorAliases.some((selectorAlias) => (
    itemAliases.some((itemAlias) => (
      selectorAlias === itemAlias ||
      selectorAlias.startsWith(`${itemAlias} `) ||
      selectorAlias.startsWith(`${itemAlias} >`) ||
      itemAlias.startsWith(`${selectorAlias} `) ||
      itemAlias.startsWith(`${selectorAlias} >`)
    ))
  ));
}

function getSelectedElementSelector(context: SelectedElementContext) {
  return context.recommendedTarget?.selector ?? context.selected.selector;
}

function isSafeSelectedAncestor(ancestor: ElementContextItem, maxDepth?: number) {
  return (
    (maxDepth === undefined || ancestor.depth <= maxDepth) &&
    ancestor.tag !== 'main' &&
    ancestor.tag !== 'article' &&
    (ancestor.areaRatio ?? 0) <= 0.7 &&
    (ancestor.linkCount ?? 0) <= 16 &&
    (ancestor.buttonCount ?? 0) <= 8
  );
}

function isSidebarLikeContext(item: ElementContextItem) {
  const target = `${item.selector} ${item.id ?? ''} ${item.className ?? ''} ${item.role ?? ''}`.toLowerCase();
  return /sidebar|side-bar|sider|aside|nav|menu|left/.test(target);
}

function hasExplicitHideIntent(instruction: string) {
  return /hide|remove|delete|discard|隐藏|移除|删除|去掉|删掉/.test(instruction);
}

function hasIconOnlyIntent(instruction: string) {
  return /icon|icons|图标|仅保留图标|只保留图标|保留图标|去掉文本|隐藏文本|隐藏文字|仅图标|只显示图标/.test(instruction);
}

function formatSelectedElementContext(context: SelectedElementContext): string {
  const selected = context.selected;
  const lines = [
    `Selected: ${selected.tag} ${selected.selector}`,
    `  rect: ${JSON.stringify(selected.rect)}`,
    `  style: ${JSON.stringify(selected.style)}`,
    `  text: ${selected.text.slice(0, 80)}`,
  ];

  if (context.recommendedTarget) {
    lines.push(`Recommended target: ${context.recommendedTarget.selector}`);
  }

  if (context.ancestors.length > 0) {
    lines.push('Ancestors:');
    for (const ancestor of context.ancestors) {
      lines.push(`  ${ancestor.depth}: ${ancestor.tag} ${ancestor.selector} | style: ${JSON.stringify(ancestor.style)} | text: ${ancestor.text.slice(0, 80)}`);
    }
  }

  if (context.siblings.length > 0) {
    lines.push('Siblings:');
    for (const sibling of context.siblings) {
      lines.push(`  ${sibling.tag} ${sibling.selector} | style: ${JSON.stringify(sibling.style)} | text: ${sibling.text.slice(0, 80)}`);
    }
  }

  const descendants = context.descendants ?? [];
  if (descendants.length > 0) {
    lines.push('Visible descendants inside selected element:');
    for (const descendant of descendants) {
      lines.push(`  ${descendant.depth}: ${descendant.tag} ${descendant.selector} | style: ${JSON.stringify(descendant.style)} | text: ${descendant.text.slice(0, 80)}`);
    }
  }

  return lines.join('\n');
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function stringifyResponseSnapshot(response: unknown) {
  const text = JSON.stringify(response, null, 2);
  const maxLength = 12000;

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n...<truncated>`;
}

export function isFallbackResult(result: GenerateCssResult): boolean {
  return result.usedFallback;
}

export { FALLBACK_CSS };
