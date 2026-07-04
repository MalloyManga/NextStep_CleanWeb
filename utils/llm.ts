import OpenAI from 'openai';
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

export async function generateCssRule(input: GenerateCssInput): Promise<GenerateCssResult> {
  const config = await resolveConfig(input.settings);
  const requestStartedAt = Date.now();
  const summaryLimit = 60;
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
- Follow the user's intent in any language. If they ask to hide/remove/delete, hide distracting elements. If they ask to beautify/enlarge/center/highlight/clean up/restyle, prefer typography, spacing, width, alignment, contrast, borders, shadows, and focus states.
- Do not default to display:none. Use display:none mainly for explicit hiding/removal requests or obvious ads/recommendation/sidebar noise.
- Keep interaction safe: do not break login, comments, buttons, inputs, or main navigation unless the user explicitly asks.
- Keep the result scoped to selectors that appear in the DOM summary.
- The explanation should use the same language as the user's instruction when practical.

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
    completion = await requestJsonCompletion(config, messages, 1500);
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
    return createFallbackResult('AI returned an empty response. Applied the built-in fallback rule.', {
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

    const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';
    const result = {
      css: parsed.css.trim(),
      explanation,
      usedFallback: false,
      debug: {
        ...debugBase,
        responseFinishedAt: Date.now(),
        rawResponse: completion.raw,
        responseSnapshot: completion.responseSnapshot,
        cssLength: parsed.css.trim().length,
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
- Do not hide html, body, main, article, or any area larger than 70% of the viewport.
- Use stable selectors: id, aria-label, role, then semantic class names.
- Prefer the recommended target if one is provided, but improve it if possible.
- CSS must only hide the target, and may use !important if necessary.`,
    },
    {
      role: 'user' as const,
      content: `Selected element context:\n${contextText}\n\nReturn the best selector to hide.`,
    },
  ];

  const completion = await requestJsonCompletion(config, messages, 1024);
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
    return {
      action: 'smart-hide',
      selector: nextSelector,
      css: parsed.css?.trim() || `${nextSelector} {\n  display: none !important;\n}`,
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
    return {
      action: 'ai-modify',
      css: '',
      explanation: 'Missing API key. AI modify is unavailable.',
    };
  }

  const contextText = formatSelectedElementContext(request.context);
  const messages = [
    {
      role: 'system' as const,
      content: `You are a web page modification assistant. Given a selected element and its surrounding context, generate CSS to modify the element according to the user's instruction.

Rules:
- Return a strict JSON object with fields: "css", "explanation".
- Only affect the selected element or its reasonable parent container.
- Do not generate JavaScript, HTML, or remote resources.
- Use !important when necessary to override existing styles.
- Keep the CSS scoped and safe.`,
    },
    {
      role: 'user' as const,
      content: `User instruction: ${request.instruction}\n\nSelected element context:\n${contextText}\n\nGenerate CSS and respond with JSON only.`,
    },
  ];

  const completion = await requestJsonCompletion(config, messages, 1024);
  if (!completion.raw) {
    return {
      action: 'ai-modify',
      css: '',
      explanation: 'AI returned an empty response.',
    };
  }

  try {
    const parsed = parseJsonObject(completion.raw) as Partial<AiModifyResult>;
    return {
      action: 'ai-modify',
      css: parsed.css?.trim() || '',
      explanation: parsed.explanation?.trim() || '',
    };
  } catch {
    return {
      action: 'ai-modify',
      css: '',
      explanation: 'AI response could not be parsed.',
    };
  }
}

async function requestJsonCompletion(
  config: LlmSettings,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  maxTokens: number,
): Promise<JsonCompletionResult> {
  const client = createClient(config);

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: maxTokens,
    });

    return {
      raw: response.choices[0]?.message?.content?.trim() ?? '',
      responseSnapshot: stringifyResponseSnapshot(response),
      retriedWithoutResponseFormat: false,
    };
  } catch (error) {
    console.warn('[CleanWeb][AI] response_format request failed, retrying without it', {
      model: config.model,
      error: getErrorMessage(error),
    });

    const response = await client.chat.completions.create({
      model: config.model,
      messages,
      max_tokens: maxTokens,
    });

    return {
      raw: response.choices[0]?.message?.content?.trim() ?? '',
      responseSnapshot: stringifyResponseSnapshot(response),
      retriedWithoutResponseFormat: true,
    };
  }
}

function createFallbackResult(explanation: string, debug: AiDebugLog): GenerateCssResult {
  return {
    css: FALLBACK_CSS,
    explanation,
    usedFallback: true,
    debug: {
      ...debug,
      cssLength: FALLBACK_CSS.length,
      explanation,
      usedFallback: true,
    },
  };
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

function formatSelectedElementContext(context: SelectedElementContext): string {
  const selected = context.selected;
  const lines = [
    `Selected: ${selected.tag} ${selected.selector}`,
    `  rect: ${JSON.stringify(selected.rect)}`,
    `  text: ${selected.text.slice(0, 80)}`,
  ];

  if (context.recommendedTarget) {
    lines.push(`Recommended target: ${context.recommendedTarget.selector}`);
  }

  if (context.ancestors.length > 0) {
    lines.push('Ancestors:');
    for (const ancestor of context.ancestors) {
      lines.push(`  ${ancestor.depth}: ${ancestor.tag} ${ancestor.selector} | text: ${ancestor.text.slice(0, 80)}`);
    }
  }

  if (context.siblings.length > 0) {
    lines.push('Siblings:');
    for (const sibling of context.siblings) {
      lines.push(`  ${sibling.tag} ${sibling.selector} | text: ${sibling.text.slice(0, 80)}`);
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
