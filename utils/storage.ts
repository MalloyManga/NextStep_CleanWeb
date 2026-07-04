import { storage } from 'wxt/utils/storage';
import type { CleanWebRule } from '../types/cleanweb';

const RULE_PREFIX = 'local:cleanweb:rule:';

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
