import { browser } from 'wxt/browser';
import type {
  ApplyRuleMessage,
  CleanWebMessage,
  CleanWebResponse,
  GeneratedRuleDraft,
} from '../types/cleanweb';
import { collectDomSummary } from '../utils/dom-summary';
import { getHostname, getRule, removeRule, saveRule } from '../utils/storage';
import { createRuleDraft, getEnabledDraftCss, getEnabledDraftInstruction } from '../utils/rule-drafts';
import { startElementPicker, type DraftInput } from '../utils/element-picker';

const STYLE_ID = 'cleanweb-generated-style';
const GUARD_STYLE_ID = 'cleanweb-anti-flicker-style';
const GUARD_CLASS = 'cleanweb-anti-flicker';
const RULE_MARKER_PREFIX = 'cleanweb:has-rule:';
const GUARD_FAILSAFE_MS = 1500;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    const hostname = getHostname();
    const guard = hasRuleMarker(hostname) ? installAntiFlickerGuard() : null;
    await applySavedRule(hostname, guard);

    browser.runtime.onMessage.addListener((message: CleanWebMessage): Promise<CleanWebResponse> => {
      if (message.type === 'CLEANWEB_COLLECT_DOM_SUMMARY') {
        const summary = collectDomSummary();
        console.info('[CleanWeb][DOM] collected summary', {
          count: summary.length,
          url: window.location.href,
        });
        return Promise.resolve({
          ok: true,
          summary,
          summaryCount: summary.length,
        });
      }

      if (message.type === 'CLEANWEB_APPLY_RULE') {
        return handleApplyRule(message);
      }

      if (message.type === 'CLEANWEB_RESET_RULE') {
        removeInjectedStyle();
        return removeRule(getHostname()).then(() => {
          clearRuleMarker(getHostname());
          return { ok: true };
        });
      }

      if (message.type === 'CLEANWEB_START_ELEMENT_PICKER') {
        startElementPicker({ applyDraft: applyDraftToPage });
        return Promise.resolve({ ok: true });
      }

      return Promise.resolve({ ok: false, error: '未知消息类型' });
    });
  },
});

async function applySavedRule(hostname: string, guard: AntiFlickerGuard | null) {
  const rule = await getRule(hostname);
  if (rule?.css) {
    injectCss(rule.css);
    markRuleSaved(hostname);
    guard?.release();
    return;
  }

  clearRuleMarker(hostname);
  guard?.release();
}

async function handleApplyRule(message: ApplyRuleMessage): Promise<CleanWebResponse> {
  if (!message.css.trim()) {
    removeInjectedStyle();
    console.info('[CleanWeb][Apply] removed injected CSS', {
      hostname: getHostname(),
      save: message.save,
      draftCount: message.drafts?.length ?? 0,
    });

    if (message.save) {
      if (message.drafts?.length) {
        await saveRule(getHostname(), {
          css: '',
          instruction: message.instruction,
          updatedAt: Date.now(),
          drafts: message.drafts,
        });
      } else {
        await removeRule(getHostname());
      }
      clearRuleMarker(getHostname());
    }

    return { ok: true };
  }

  injectCss(message.css);
  console.info('[CleanWeb][Apply] injected CSS rule', {
    hostname: getHostname(),
    cssLength: message.css.length,
    instruction: message.instruction,
    save: message.save,
    draftCount: message.drafts?.length ?? 0,
  });

  if (message.save) {
    await saveRule(getHostname(), {
      css: message.css,
      instruction: message.instruction,
      updatedAt: Date.now(),
      drafts: message.drafts,
    });
    markRuleSaved(getHostname());
  }

  return { ok: true };
}

function injectCss(css: string) {
  const existingStyle = document.getElementById(STYLE_ID);
  let style = existingStyle instanceof HTMLStyleElement ? existingStyle : null;

  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.dataset.cleanweb = 'true';
    const parent = document.head ?? document.documentElement;
    parent.appendChild(style);
  }

  style.textContent = css;
}

function removeInjectedStyle() {
  document.getElementById(STYLE_ID)?.remove();
}

interface AntiFlickerGuard {
  release: () => void;
}

function installAntiFlickerGuard(): AntiFlickerGuard {
  document.documentElement.classList.add(GUARD_CLASS);

  const style = document.createElement('style');
  style.id = GUARD_STYLE_ID;
  style.dataset.cleanweb = 'anti-flicker';
  style.textContent = `
    html.${GUARD_CLASS} body {
      opacity: 0 !important;
    }
  `;
  document.documentElement.appendChild(style);

  let released = false;
  const failsafeId = window.setTimeout(release, GUARD_FAILSAFE_MS);

  function release() {
    if (released) return;

    released = true;
    window.clearTimeout(failsafeId);
    window.requestAnimationFrame(() => {
      document.documentElement.classList.remove(GUARD_CLASS);
      document.getElementById(GUARD_STYLE_ID)?.remove();
    });
  }

  return { release };
}

function hasRuleMarker(hostname: string) {
  return readLocalStorage(`${RULE_MARKER_PREFIX}${hostname}`) === 'true';
}

function markRuleSaved(hostname: string) {
  writeLocalStorage(`${RULE_MARKER_PREFIX}${hostname}`, 'true');
}

function clearRuleMarker(hostname: string) {
  removeLocalStorage(`${RULE_MARKER_PREFIX}${hostname}`);
}

function readLocalStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Some pages disable localStorage; saved rules still work without the guard.
  }
}

function removeLocalStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Some pages disable localStorage; there is no marker to clean up.
  }
}

async function applyDraftToPage(input: DraftInput): Promise<void> {
  const hostname = getHostname();
  const existingRule = await getRule(hostname);
  const draft = createRuleDraft(input);
  const nextDrafts = addRuleDraft(existingRule, draft);
  const nextCss = getEnabledDraftCss(nextDrafts);

  injectCss(nextCss);
  await saveRule(hostname, {
    css: nextCss,
    instruction: getEnabledDraftInstruction(nextDrafts, (n) => `已启用 ${n} 条规则`),
    updatedAt: Date.now(),
    drafts: nextDrafts,
  });
  markRuleSaved(hostname);
}

function addRuleDraft(rule: Awaited<ReturnType<typeof getRule>>, draft: GeneratedRuleDraft) {
  return [draft, ...getExistingRuleDrafts(rule)].slice(0, 20);
}

function getExistingRuleDrafts(rule: Awaited<ReturnType<typeof getRule>>): GeneratedRuleDraft[] {
  if (!rule) return [];
  if (rule.drafts?.length) return rule.drafts;
  if (!rule.css.trim()) return [];

  return [{
    id: `legacy-${rule.updatedAt}`,
    instruction: rule.instruction || '历史规则',
    css: rule.css,
    explanation: '从旧版保存规则迁移显示',
    enabled: true,
    createdAt: rule.updatedAt,
    source: 'legacy',
  }];
}
