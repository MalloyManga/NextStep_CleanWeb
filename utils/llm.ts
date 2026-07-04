import type { DomSummaryItem } from '../types/cleanweb';

export const FALLBACK_CSS = `aside,
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

export interface GenerateCssInput {
  instruction: string;
  domSummary: DomSummaryItem[];
}

export interface GenerateCssResult {
  css: string;
  explanation: string;
}

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatChoice {
  message?: {
    content?: string;
  };
}

interface ChatCompletionResponse {
  choices?: ChatChoice[];
}

export async function generateCssRule(input: GenerateCssInput): Promise<GenerateCssResult> {
  const apiKey = import.meta.env.WXT_LLM_API_KEY;

  if (!apiKey) {
    return createFallbackResult('未配置 LLM API Key，已使用本地 fallback 规则。');
  }

  const baseUrl = trimTrailingSlash(import.meta.env.WXT_LLM_BASE_URL || 'https://api.openai.com/v1');
  const model = import.meta.env.WXT_LLM_MODEL || 'gpt-4o-mini';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: createPromptMessages(input),
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    return createFallbackResult(`LLM 请求失败：${response.status}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return createFallbackResult('LLM 返回为空，已使用 fallback 规则。');
  }

  return parseGenerateCssResult(content);
}

function createPromptMessages(input: GenerateCssInput): ChatMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是浏览器插件 CleanWeb 的网页净化 CSS 规则生成器。',
        '你只能返回 JSON，不要返回 Markdown。',
        '只能生成 CSS，不能生成 JS，不能生成 HTML，不能引用远程资源。',
        '优先使用稳定选择器：id、aria-label、role、语义 class。',
        '避免过深 nth-child，避免影响登录、评论、按钮等交互。',
        '必要时可以使用 !important。',
        '返回格式必须是 {"css":"...","explanation":"..."}。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        instruction: input.instruction,
        domSummary: input.domSummary,
      }),
    },
  ];
}

function parseGenerateCssResult(content: string): GenerateCssResult {
  const parsed = parseJsonObject(content);
  const css = typeof parsed.css === 'string' ? parsed.css.trim() : '';
  const explanation = typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '';

  if (!css) {
    return createFallbackResult('LLM 未返回可用 CSS，已使用 fallback 规则。');
  }

  return {
    css,
    explanation: explanation || '已根据当前页面摘要生成 CSS 规则。',
  };
}

function parseJsonObject(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return {};

    try {
      const parsed = JSON.parse(match[0]) as unknown;
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
}

function createFallbackResult(explanation: string): GenerateCssResult {
  return {
    css: FALLBACK_CSS,
    explanation,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}
