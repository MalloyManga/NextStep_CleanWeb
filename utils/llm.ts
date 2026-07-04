import OpenAI from 'openai';
import type {
  AiModifyRequest,
  AiModifyResult,
  DomSummaryItem,
  LlmSettings,
  SelectedElementContext,
  SmartHideRequest,
  SmartHideResult,
} from '../types/cleanweb';

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

const FALLBACK_RESULT_NOKEY: GenerateCssResult = {
  css: FALLBACK_CSS,
  explanation: '未配置 API Key，使用内置通用规则隐藏常见侧边栏和广告区域。',
  usedFallback: true,
};

const FALLBACK_RESULT_FAILED: GenerateCssResult = {
  css: FALLBACK_CSS,
  explanation: '生成规则失败，使用内置通用规则隐藏常见侧边栏和广告区域。',
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
async function resolveConfig(settings?: LlmSettings): Promise<LlmSettings> {
  const defaults = getDefaultLlmConfig();
  const fromStorage = await import('../utils/storage').then((m) => m.getLlmSettings());
  const result = (
    fromStorage?.apiKey &&
    fromStorage?.baseUrl &&
    fromStorage?.model
  ) ? fromStorage : defaults;

  console.log(result);
  return {
    apiKey: result.apiKey.trim(),
    baseUrl: result.baseUrl.trim(),
    model: result.model.trim(),
  }
}

export async function generateCssRule(input: GenerateCssInput): Promise<GenerateCssResult> {
  const config = await resolveConfig(input.settings);

  console.log(config);

  if (!config.apiKey) {
    return FALLBACK_RESULT_NOKEY;
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
    return FALLBACK_RESULT_FAILED;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GenerateCssResult>;
    if (!parsed.css || typeof parsed.css !== 'string') {
      return FALLBACK_RESULT_FAILED;
    }
    return {
      css: parsed.css.trim(),
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : '',
      usedFallback: false,
    };
  } catch {
    return FALLBACK_RESULT_FAILED;
  }
}

export async function generateSmartHideRule(
  request: SmartHideRequest,
): Promise<SmartHideResult> {
  const config = await resolveConfig();

  if (!config.apiKey) {
    return {
      action: 'smart-hide',
      selector: request.context.recommendedTarget?.selector ?? request.context.selected.selector,
      css: fallbackSmartHideCss(request.context),
      explanation: '未配置 API Key，使用内置规则隐藏推荐目标。',
    };
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true,
  });

  const contextText = formatSelectedElementContext(request.context);

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: 'system',
        content: `You are a web page cleaning assistant. Given a selected element and its ancestor chain, choose the best CSS selector to hide the most relevant container.

Rules:
- Only output a strict JSON object with fields: "selector", "css", "explanation".
- The selector should target the smallest reasonable container that removes the visual noise.
- Do not hide html, body, main, article, or any area larger than 70% of the viewport.
- Use stable selectors: id, aria-label, role, then semantic class names.
- Prefer the recommended target if one is provided, but improve it if possible.
- CSS must only hide the target, and may use !important if necessary.`,
      },
      {
        role: 'user',
        content: `Selected element context:\n${contextText}\n\nReturn the best selector to hide.`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1024,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  if (!raw) {
    return {
      action: 'smart-hide',
      selector: request.context.recommendedTarget?.selector ?? request.context.selected.selector,
      css: fallbackSmartHideCss(request.context),
      explanation: 'AI 未返回结果，使用内置规则隐藏。',
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SmartHideResult>;
    const selector = parsed.selector?.trim() || (request.context.recommendedTarget?.selector ?? request.context.selected.selector);
    const css = parsed.css?.trim() || `${selector} { display: none !important; }`;
    return {
      action: 'smart-hide',
      selector,
      css,
      explanation: parsed.explanation?.trim() || '',
    };
  } catch {
    return {
      action: 'smart-hide',
      selector: request.context.recommendedTarget?.selector ?? request.context.selected.selector,
      css: fallbackSmartHideCss(request.context),
      explanation: 'AI 返回解析失败，使用内置规则隐藏。',
    };
  }
}

export async function generateAiModifyRule(
  request: AiModifyRequest,
): Promise<AiModifyResult> {
  const config = await resolveConfig();

  if (!config.apiKey) {
    return {
      action: 'ai-modify',
      css: '',
      explanation: '未配置 API Key，无法执行 AI 修改。',
    };
  }

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    dangerouslyAllowBrowser: true,
  });

  const contextText = formatSelectedElementContext(request.context);

  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: 'system',
        content: `You are a web page modification assistant. Given a selected element and its surrounding context, generate CSS to modify the element according to the user's instruction.

Rules:
- Only output a strict JSON object with fields: "css", "explanation".
- Only affect the selected element or its reasonable parent container.
- Do not generate JavaScript, HTML, or remote resources.
- Use !important when necessary to override existing styles.
- Keep the CSS scoped and safe.`,
      },
      {
        role: 'user',
        content: `User instruction: ${request.instruction}\n\nSelected element context:\n${contextText}\n\nGenerate CSS and respond with JSON only.`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1024,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  if (!raw) {
    return {
      action: 'ai-modify',
      css: '',
      explanation: 'AI 未返回结果。',
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AiModifyResult>;
    return {
      action: 'ai-modify',
      css: parsed.css?.trim() || '',
      explanation: parsed.explanation?.trim() || '',
    };
  } catch {
    return {
      action: 'ai-modify',
      css: '',
      explanation: 'AI 返回解析失败。',
    };
  }
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

export function isFallbackResult(result: GenerateCssResult): boolean {
  return result.usedFallback;
}

export { FALLBACK_CSS };
