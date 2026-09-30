import type { LlmSettings } from '../types/cleanweb';
import { createClient } from './llm-config';
import { getErrorMessage, stringifyResponseSnapshot } from './llm-response';

export interface JsonCompletionResult {
  raw: string;
  responseSnapshot: string;
  retriedWithoutResponseFormat: boolean;
}

export const PAGE_GENERATION_MAX_TOKENS = 6000;
export const SMART_HIDE_MAX_TOKENS = 1600;
export const AI_MODIFY_MAX_TOKENS = 3200;
const AI_REQUEST_TIMEOUT_MS = 60_000;

export async function requestJsonCompletion(
  config: LlmSettings,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  maxTokens: number,
): Promise<JsonCompletionResult> {
  const client = createClient(config);
  const withTimeout = createRequestTimeout(AI_REQUEST_TIMEOUT_MS);
  const timeoutMessage = () =>
    `AI 请求超过 ${Math.round(AI_REQUEST_TIMEOUT_MS / 1000)} 秒未完成，请重试。`;

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
      throw new Error(timeoutMessage());
    }

    // 只有当服务端明确抱怨 response_format 不支持时才去掉 response_format 重试;
    // 401/402/429/5xx 等重试也没用,直接抛清晰中文错误。
    if (!isResponseFormatUnsupported(error)) {
      throw new Error(describeLlmError(error));
    }

    console.warn('[CleanWeb][AI] response_format not supported, retrying without it', {
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
        throw new Error(timeoutMessage());
      }

      throw new Error(describeLlmError(retryError));
    } finally {
      retryTimeout.clear();
    }
  } finally {
    withTimeout.clear();
  }
}

export function isResponseFormatUnsupported(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (status !== 400) return false;
  return /response_format|json_object|json mode|json mode/i.test(getErrorMessage(error));
}

export function describeLlmError(error: unknown): string {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === 'number') {
    if (status === 401) return 'AI Key 无效或已过期，请在设置中检查/更新。';
    if (status === 402) return 'AI 账户余额不足，请先充值后重试。';
    if (status === 403) return 'AI 服务禁止访问，请检查 Key 权限或 Base URL。';
    if (status === 404) return 'AI 端点或模型不存在，请检查 Base URL 与 Model。';
    if (status === 429) return 'AI 请求过于频繁，请稍候再试。';
    if (status >= 500) return 'AI 服务暂时不可用，请稍后重试。';
    return `AI 请求失败（HTTP ${status}）：${getErrorMessage(error)}`;
  }
  // 无 HTTP status：网络/超时/其它异常
  return `AI 请求失败：${getErrorMessage(error)}`;
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
