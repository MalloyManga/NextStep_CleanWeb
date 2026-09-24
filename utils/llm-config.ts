import OpenAI from 'openai';
import type { LlmSettings } from '../types/cleanweb';
import { getLlmSettings } from './storage';

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

export async function resolveConfig(settings?: LlmSettings): Promise<LlmSettings> {
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

export function createClient(config: LlmSettings) {
  return new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    dangerouslyAllowBrowser: true,
  });
}
