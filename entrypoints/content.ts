import { browser } from 'wxt/browser';
import type {
  ApplyRuleMessage,
  CleanWebMessage,
  CleanWebResponse,
  DomSummaryItem,
} from '../types/cleanweb';
import { buildReadableSelector, collectDomSummary } from '../utils/dom-summary';
import { getHostname, getRule, removeRule, saveRule } from '../utils/storage';

const STYLE_ID = 'cleanweb-generated-style';

export default defineContentScript({
  matches: ['<all_urls>'],
  async main() {
    await applySavedRule();

    browser.runtime.onMessage.addListener((message: CleanWebMessage): Promise<CleanWebResponse> => {
      if (message.type === 'CLEANWEB_COLLECT_DOM_SUMMARY') {
        const summary = collectDomSummary();
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
        return removeRule(getHostname()).then(() => ({ ok: true }));
      }

      return Promise.resolve({ ok: false, error: '未知消息类型' });
    });
  },
});

async function applySavedRule() {
  const rule = await getRule(getHostname());
  if (rule?.css) {
    injectCss(rule.css);
  }
}

async function handleApplyRule(message: ApplyRuleMessage): Promise<CleanWebResponse> {
  injectCss(message.css);

  if (message.save) {
    await saveRule(getHostname(), {
      css: message.css,
      instruction: message.instruction,
      updatedAt: Date.now(),
    });
  }

  return { ok: true };
}

function injectCss(css: string) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.dataset.cleanweb = 'true';
    document.documentElement.appendChild(style);
  }

  style.textContent = css;
}

function removeInjectedStyle() {
  document.getElementById(STYLE_ID)?.remove();
}

export { buildReadableSelector, collectDomSummary };
export type { DomSummaryItem };
