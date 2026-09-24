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
