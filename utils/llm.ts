import OpenAI from 'openai';
import type { AiDebugLog, DomSummaryItem, LlmSettings } from '../types/cleanweb';

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

function resolveConfig(input: GenerateCssInput): LlmSettings {
  const defaults = getDefaultLlmConfig();
  const fromInput = input.settings;

  return {
    apiKey: (fromInput?.apiKey || defaults.apiKey).trim(),
    baseUrl: (fromInput?.baseUrl || defaults.baseUrl).trim(),
    model: (fromInput?.model || defaults.model || 'gpt-4o-mini').trim(),
  };
}

export async function generateCssRule(input: GenerateCssInput): Promise<GenerateCssResult> {
  const config = resolveConfig(input);
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

  const client = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    dangerouslyAllowBrowser: true,
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

  let raw = '';
  let retriedWithoutResponseFormat = false;

  try {
    const response = await client.chat.completions.create({
      model: config.model,
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 1500,
    });

    raw = response.choices[0]?.message?.content?.trim() ?? '';
  } catch (error) {
    retriedWithoutResponseFormat = true;
    console.warn('[CleanWeb][AI] response_format request failed, retrying without it', {
      model: config.model,
      error: getErrorMessage(error),
    });

    try {
      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        max_tokens: 1500,
      });

      raw = response.choices[0]?.message?.content?.trim() ?? '';
    } catch (retryError) {
      return createFallbackResult('Rule generation request failed. Applied the built-in fallback rule.', {
        ...debugBase,
        responseFinishedAt: Date.now(),
        requestError: getErrorMessage(retryError),
        usedFallback: true,
        retriedWithoutResponseFormat,
      });
    }
  }

  if (!raw) {
    console.warn('[CleanWeb][AI] empty response', {
      model: config.model,
    });
    return createFallbackResult('AI returned an empty response. Applied the built-in fallback rule.', {
      ...debugBase,
      responseFinishedAt: Date.now(),
      rawResponse: raw,
      parseError: 'Empty response',
      usedFallback: true,
      retriedWithoutResponseFormat,
    });
  }

  try {
    const parsed = parseJsonObject(raw) as Partial<GenerateCssResult>;
    if (!parsed.css || typeof parsed.css !== 'string') {
      return createFallbackResult('AI response did not include a valid css field. Applied the built-in fallback rule.', {
        ...debugBase,
        responseFinishedAt: Date.now(),
        rawResponse: raw,
        parseError: 'Missing css string field',
        usedFallback: true,
        retriedWithoutResponseFormat,
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
        rawResponse: raw,
        cssLength: parsed.css.trim().length,
        explanation,
        usedFallback: false,
        retriedWithoutResponseFormat,
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
      rawLength: raw.length,
      model: config.model,
    });
    return createFallbackResult('AI response could not be parsed as JSON. Applied the built-in fallback rule.', {
      ...debugBase,
      responseFinishedAt: Date.now(),
      rawResponse: raw,
      parseError: getErrorMessage(error),
      usedFallback: true,
      retriedWithoutResponseFormat,
    });
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isFallbackResult(result: GenerateCssResult): boolean {
  return result.usedFallback;
}

export { FALLBACK_CSS };
