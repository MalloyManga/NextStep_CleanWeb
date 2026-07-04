import OpenAI from 'openai';
import type { DomSummaryItem } from '../types/cleanweb';

import type { LlmSettings } from '../types/cleanweb';

export interface GenerateCssInput {
  instruction: string;
  domSummary: DomSummaryItem[];
  settings?: LlmSettings;
}

export interface GenerateCssResult {
  css: string;
  explanation: string;
  usedFallback: boolean;
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

const FALLBACK_RESULT: GenerateCssResult = {
  css: FALLBACK_CSS,
  explanation: '未配置 API Key，使用内置通用规则隐藏常见侧边栏和广告区域。',
  usedFallback: true,
};

declare const __LLM_API_KEY__: string;
declare const __LLM_BASE_URL__: string;
declare const __LLM_MODEL__: string;

export function getDefaultLlmConfig(): LlmSettings {
  return {
    apiKey: typeof __LLM_API_KEY__ !== 'undefined' ? __LLM_API_KEY__ : '',
    baseUrl: typeof __LLM_BASE_URL__ !== 'undefined' ? __LLM_BASE_URL__ : 'https://api.openai.com/v1',
    model: typeof __LLM_MODEL__ !== 'undefined' ? __LLM_MODEL__ : 'gpt-4o-mini',
  };
}

function resolveConfig(input: GenerateCssInput): LlmSettings {
  const defaults = getDefaultLlmConfig();
  const fromInput = input.settings;

  return {
    apiKey: (fromInput?.apiKey ?? defaults.apiKey).trim(),
    baseUrl: (fromInput?.baseUrl ?? defaults.baseUrl).trim() || 'https://api.openai.com/v1',
    model: (fromInput?.model ?? defaults.model).trim() || 'gpt-4o-mini',
  };
}

export async function generateCssRule(input: GenerateCssInput): Promise<GenerateCssResult> {
  const config = resolveConfig(input);

  if (!config.apiKey) {
    return FALLBACK_RESULT;
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true,
  });

  const domSummaryText = JSON.stringify(input.domSummary.slice(0, 40), null, 2);

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: 'system',
        content: `You are a web page cleaning assistant. You generate safe, scoped CSS rules to hide noisy elements or restyle the page based on the user's instruction.

Rules:
- Only output raw CSS. Do not include HTML, JS, or Markdown code blocks.
- Use stable selectors: id, aria-label, role, then semantic class names.
- Avoid nth-child and overly deep selectors.
- Use !important only when necessary to override existing styles.
- Only affect the distracting areas mentioned; do not break login, comments, buttons, or main navigation.
- Return your response as a strict JSON object with exactly two fields: "css" and "explanation".

Example output:
{
  "css": ".sidebar, .ads { display: none !important; } main { max-width: 900px; margin: 0 auto; }",
  "explanation": "隐藏侧边栏和广告，优化正文宽度"
}`,
      },
      {
        role: 'user',
        content: `User instruction: ${input.instruction}

DOM summary of the current page (first 40 elements):
${domSummaryText}

Generate CSS and respond with JSON only.`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1024,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  if (!raw) {
    return FALLBACK_RESULT;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GenerateCssResult>;
    if (!parsed.css || typeof parsed.css !== 'string') {
      return FALLBACK_RESULT;
    }
    return {
      css: parsed.css.trim(),
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '',
      usedFallback: false,
    };
  } catch {
    return FALLBACK_RESULT;
  }
}

export function isFallbackResult(result: GenerateCssResult): boolean {
  return result.usedFallback;
}

export { FALLBACK_CSS };
