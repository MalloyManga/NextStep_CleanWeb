import type { SelectedElementContext } from '../types/cleanweb';
import { getSelectedElementSelector, isSidebarLikeContext } from './css-safety';

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

export function fallbackSmartHideCss(context: SelectedElementContext): string {
  const selector = context.recommendedTarget?.selector ?? context.selected.selector;
  return `${selector} {\n  display: none !important;\n}`;
}

export function fallbackAiModifyCss(context: SelectedElementContext, instruction: string): string {
  if (hasIconOnlyIntent(instruction)) {
    return fallbackIconOnlyCss(context);
  }

  const selector = getSelectedElementSelector(context);
  const wantsEmphasis = /highlight|emphasize|醒目|突出|高亮|强调|放大|变大/.test(instruction);

  return `${selector} {
  border-radius: ${wantsEmphasis ? '14px' : '10px'} !important;
  box-shadow: ${wantsEmphasis ? '0 10px 28px rgb(46 111 99 / 22%)' : '0 6px 18px rgb(23 32 38 / 12%)'} !important;
  outline: ${wantsEmphasis ? '2px solid rgb(46 111 99 / 40%)' : '1px solid rgb(46 111 99 / 18%)'} !important;
  background: rgb(255 255 255 / 96%) !important;
  padding: ${wantsEmphasis ? '14px' : '10px'} !important;
  transition: all 160ms ease !important;
}`;
}

function fallbackIconOnlyCss(context: SelectedElementContext): string {
  const selector = getSelectedElementSelector(context);
  const layoutSelectors = getIconOnlyLayoutSelectors(context);

  return `${layoutSelectors.join(', ')} {
  width: 76px !important;
  min-width: 76px !important;
  max-width: 76px !important;
  flex: 0 0 76px !important;
  grid-template-columns: 76px !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  overflow: hidden !important;
}

${selector} {
  padding: 8px 6px !important;
}

${selector} > *,
${selector} ul,
${selector} nav,
${selector} [class*="list"],
${selector} [class*="group"] {
  width: 100% !important;
  max-width: 100% !important;
  padding-left: 0 !important;
  padding-right: 0 !important;
  margin-left: 0 !important;
  margin-right: 0 !important;
}

${selector} a,
${selector} li,
${selector} button,
${selector} [role="button"],
${selector} [role="menuitem"],
${selector} [class*="item"],
${selector} [class*="nav"],
${selector} [class*="menu"] {
  width: 52px !important;
  min-width: 52px !important;
  max-width: 52px !important;
  height: 52px !important;
  min-height: 52px !important;
  margin: 6px auto !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 0 !important;
  text-align: center !important;
  font-size: 0 !important;
  line-height: 0 !important;
}

${selector} svg,
${selector} img,
${selector} i,
${selector} [class*="icon"],
${selector} [class*="Icon"] {
  display: inline-flex !important;
  width: 24px !important;
  min-width: 24px !important;
  height: 24px !important;
  min-height: 24px !important;
  margin: 0 auto !important;
  font-size: 24px !important;
  line-height: 1 !important;
  opacity: 1 !important;
  visibility: visible !important;
  flex: 0 0 auto !important;
}

${selector} [class*="text"],
${selector} [class*="label"],
${selector} [class*="title"],
${selector} [class*="name"],
${selector} [class*="badge"],
${selector} [class*="coupon"],
${selector} [class*="price"],
${selector} [class*="promo"],
${selector} [class*="discount"],
${selector} [class*="footer"],
${selector} [class*="copyright"],
${selector} [class*="record"],
${selector} footer {
  display: none !important;
}`;
}

function getIconOnlyLayoutSelectors(context: SelectedElementContext) {
  return Array.from(new Set([
    getSelectedElementSelector(context),
    ...context.ancestors
      .filter((ancestor) => ancestor.depth <= 2 && isSidebarLikeContext(ancestor))
      .map((ancestor) => ancestor.selector),
  ]));
}

function hasIconOnlyIntent(instruction: string) {
  return /icon|icons|图标|仅保留图标|只保留图标|保留图标|去掉文本|隐藏文本|隐藏文字|仅图标|只显示图标/.test(instruction);
}
