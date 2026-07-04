import { storage } from 'wxt/utils/storage';
import type { CleanWebRule, GenerationState, LlmSettings } from '../types/cleanweb';

const RULE_PREFIX = 'local:cleanweb:rule:';
const GENERATION_PREFIX = 'local:cleanweb:generation:';
const LLM_SETTINGS_KEY = 'local:cleanweb:llm-settings';

export function getHostname() {
  return window.location.hostname;
}

export function getRule(hostname: string) {
  return storage.getItem<CleanWebRule>(`${RULE_PREFIX}${hostname}`);
}

export function saveRule(hostname: string, rule: CleanWebRule) {
  return storage.setItem(`${RULE_PREFIX}${hostname}`, rule);
}

export function removeRule(hostname: string) {
  return storage.removeItem(`${RULE_PREFIX}${hostname}`);
}

export function getGenerationState(hostname: string) {
  return storage.getItem<GenerationState>(`${GENERATION_PREFIX}${hostname}`);
}

export function saveGenerationState(hostname: string, state: GenerationState) {
  return storage.setItem(`${GENERATION_PREFIX}${hostname}`, state);
}

export function removeGenerationState(hostname: string) {
  return storage.removeItem(`${GENERATION_PREFIX}${hostname}`);
}

export function getLlmSettings() {
  return storage.getItem<LlmSettings>(LLM_SETTINGS_KEY);
}

export function saveLlmSettings(settings: LlmSettings) {
  return storage.setItem(LLM_SETTINGS_KEY, settings);
}
