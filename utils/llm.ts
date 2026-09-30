import type {
  AiDebugLog,
  AiModifyRequest,
  AiModifyResult,
  DomSummaryItem,
  LlmSettings,
  SelectedElementContext,
  SmartHideRequest,
  SmartHideResult,
} from '../types/cleanweb';
import {
  getProtectedTerms,
  hasExplicitHideIntent,
  sanitizeGeneratedCss,
  sanitizeSelectedElementCss,
} from './css-safety';
import { getDefaultLlmConfig, resolveConfig } from './llm-config';
import type { JsonCompletionResult } from './llm-request';
import {
  AI_MODIFY_MAX_TOKENS,
  PAGE_GENERATION_MAX_TOKENS,
  SMART_HIDE_MAX_TOKENS,
  requestJsonCompletion,
} from './llm-request';
import { parseJsonObject } from './llm-response';
import { fallbackSmartHideCss } from './llm-fallback';

export { getDefaultLlmConfig };

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

  if (!config.apiKey) {
    console.warn('[CleanWeb][AI] skipped request: missing API key', {
      instruction: input.instruction,
      summaryCount: input.domSummary.length,
    });
    throw new Error('未配置 AI Key：请先在设置中填写 API Key 后再使用整页净化。');
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
- Hide ad shells/containers instead of only hiding ad images or iframes. Prefer selectors whose id/class/text contains ad, ads, advert, banner, promotion, or sponsor.
- If the user asks to keep specific sections, do not hide any selector whose DOM summary text contains those kept section names.
- Do not restyle carousel/swiper internals unless the user explicitly asks. Avoid setting display/grid/flex/width on selectors containing carousel or swiper.
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
    throw error instanceof Error ? error : new Error(String(error));
  }

  if (!completion.raw) {
    console.warn('[CleanWeb][AI] empty response', {
      model: config.model,
    });
    throw new Error('AI 返回了空响应，可能输出预算被推理占用或额度不足，请重试或更换模型。');
  }

  let parsed: Partial<GenerateCssResult>;
  try {
    parsed = parseJsonObject(completion.raw) as Partial<GenerateCssResult>;
  } catch (error) {
    console.warn('[CleanWeb][AI] failed to parse response', {
      rawLength: completion.raw.length,
      model: config.model,
    });
    throw new Error('AI 返回结果不是合法 JSON，请重试。');
  }

  if (!parsed.css || typeof parsed.css !== 'string') {
    throw new Error('AI 返回结果缺少有效的 css 字段，请重试。');
  }

  const sanitizedCss = sanitizeGeneratedCss(parsed.css.trim(), input.domSummary, input.instruction);
  if (!sanitizedCss) {
    throw new Error('AI 生成的规则没有通过安全检查，请换个说法重试。');
  }
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

  if (!config.apiKey) {
    throw new Error('未配置 AI Key：请先在设置中填写 API Key 后再使用 AI 修改。');
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
- Never hide any selected-context item whose text contains a section the user explicitly asked to keep.
- If a listed descendant's selector or text directly matches the user's target, use that selector exactly.
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
    throw new Error('AI 返回了空响应，请重试或更换模型。');
  }

  let parsed: Partial<AiModifyResult>;
  try {
    parsed = parseJsonObject(completion.raw) as Partial<AiModifyResult>;
  } catch {
    throw new Error('AI 返回结果不是合法 JSON，请重试。');
  }

  const allowHide = hasExplicitHideIntent(request.instruction);
  const sanitizedCss = sanitizeSelectedElementCss(parsed.css?.trim() || '', request.context, {
    allowHide,
    allowDescendants: true,
    protectedTerms: getProtectedTerms(request.instruction),
  });
  if (!sanitizedCss) {
    throw new Error('AI 生成的样式没有通过安全检查，请换个说法重试。');
  }

  return {
    action: 'ai-modify',
    css: sanitizedCss,
    explanation: parsed.explanation?.trim() || '',
  };
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

