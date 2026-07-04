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
const PICKER_LAYER_ID = 'cleanweb-picker-layer';
const PICKER_OUTLINE_ID = 'cleanweb-picker-outline';
const PICKER_TOOLBAR_ID = 'cleanweb-picker-toolbar';
const PICKER_PANEL_ID = 'cleanweb-picker-ai-panel';
const GUARD_STYLE_ID = 'cleanweb-anti-flicker-style';
const GUARD_CLASS = 'cleanweb-anti-flicker';
const RULE_MARKER_PREFIX = 'cleanweb:has-rule:';
const GUARD_FAILSAFE_MS = 1500;
const MIN_HIDE_TARGET_AREA = 900;
const MAX_HIDE_TARGET_AREA_RATIO = 0.72;

let pickerState: PickerState | null = null;

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
        startElementPicker();
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
  injectCss(message.css);

  if (message.save) {
    await saveRule(getHostname(), {
      css: message.css,
      instruction: message.instruction,
      updatedAt: Date.now(),
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

interface PickerState {
  hoveredElement: HTMLElement | null;
  selectedElement: HTMLElement | null;
  selectedTarget: HTMLElement | null;
  pointer: {
    x: number;
    y: number;
  };
  layer: HTMLDivElement;
  hoverOutline: HTMLDivElement;
  outline: HTMLDivElement;
  toolbar: HTMLDivElement;
  panel: HTMLDivElement;
  selectorLabel: HTMLSpanElement;
}

function startElementPicker() {
  stopElementPicker();

  const layer = document.createElement('div');
  layer.id = PICKER_LAYER_ID;
  layer.style.cssText = [
    'position: fixed',
    'inset: 0',
    'z-index: 2147483646',
    'pointer-events: none',
    'font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
  ].join(';');

  // 悬停描边：浅色细线
  const hoverOutline = document.createElement('div');
  hoverOutline.id = 'cleanweb-picker-hover';
  hoverOutline.style.cssText = [
    'position: fixed',
    'display: none',
    'z-index: 2147483646',
    'pointer-events: none',
    'border: 1px solid rgb(46 111 99 / 55%)',
    'border-radius: 6px',
    'background: rgb(46 111 99 / 6%)',
    'transition: all 80ms ease-out',
  ].join(';');

  // 选中描边：品牌色实心 + 遮罩
  const selectOutline = document.createElement('div');
  selectOutline.id = PICKER_OUTLINE_ID;
  selectOutline.style.cssText = [
    'position: fixed',
    'display: none',
    'z-index: 2147483646',
    'pointer-events: none',
    'border: 2px solid #2e6f63',
    'border-radius: 8px',
    'background: rgb(46 111 99 / 10%)',
    'box-shadow: 0 0 0 9999px rgb(23 32 38 / 14%)',
  ].join(';');

  // 操作浮层：带文字按钮 + 关闭
  const toolbar = document.createElement('div');
  toolbar.id = PICKER_TOOLBAR_ID;
  toolbar.style.cssText = [
    'position: fixed',
    'display: none',
    'flex-direction: column',
    'gap: 8px',
    'z-index: 2147483647',
    'pointer-events: auto',
    'min-width: 180px',
    'padding: 10px',
    'border: 1px solid rgb(230 228 223)',
    'border-radius: 12px',
    'background: #ffffff',
    'box-shadow: 0 12px 36px rgb(23 32 38 / 20%)',
    'color: #1f2a2e',
  ].join(';');

  // 顶部：选中信息 + 关闭
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';

  const selectorLabel = document.createElement('span');
  selectorLabel.style.cssText = 'flex:1;min-width:0;font-size:11px;font-weight:600;color:#8a9499;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', '关闭选择模式');
  closeButton.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'justify-content:center',
    'width:22px',
    'height:22px',
    'flex-shrink:0',
    'border:0',
    'border-radius:6px',
    'background:transparent',
    'color:#8a9499',
    'cursor:pointer',
  ].join(';');
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  closeButton.addEventListener('click', (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    stopElementPicker();
  });

  head.append(selectorLabel, closeButton);

  // 按钮行
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px';

  const hideButton = createPickerButton('隐藏', createTrashIcon(), true);
  hideButton.addEventListener('click', handleHideSelectedElement);
  const aiButton = createPickerButton('AI 修改', createSparkleIcon(), false);
  aiButton.addEventListener('click', showAiPanel);
  actions.append(hideButton, aiButton);

  toolbar.append(head, actions);

  // AI 内联面板
  const panel = document.createElement('div');
  panel.id = PICKER_PANEL_ID;
  panel.style.cssText = [
    'display: none',
    'flex-direction: column',
    'gap: 6px',
    'margin-top: 2px',
  ].join(';');
  panel.append(createAiPanelContent());

  toolbar.append(panel);

  layer.append(hoverOutline, selectOutline, toolbar);
  document.documentElement.appendChild(layer);

  pickerState = {
    hoveredElement: null,
    selectedElement: null,
    selectedTarget: null,
    pointer: { x: 0, y: 0 },
    layer,
    hoverOutline,
    outline: selectOutline,
    toolbar,
    panel,
    selectorLabel,
  };

  window.addEventListener('mousemove', handlePickerMouseMove, true);
  window.addEventListener('click', handlePickerClick, true);
  window.addEventListener('keydown', handlePickerKeyDown, true);
}

function stopElementPicker() {
  if (!pickerState) return;

  window.removeEventListener('mousemove', handlePickerMouseMove, true);
  window.removeEventListener('click', handlePickerClick, true);
  window.removeEventListener('keydown', handlePickerKeyDown, true);
  pickerState.layer.remove();
  pickerState = null;
}

function handlePickerMouseMove(event: MouseEvent) {
  const state = pickerState;
  if (!state) return;

  state.pointer = { x: event.clientX, y: event.clientY };

  const target = event.target;
  if (!(target instanceof HTMLElement) || isCleanWebElement(target)) {
    return;
  }

  state.hoveredElement = target;

  // 未选中时显示悬停描边
  if (!state.selectedElement) {
    renderHoverOutline(target);
  }
}

function handlePickerClick(event: MouseEvent) {
  const state = pickerState;
  if (!state) return;

  const target = event.target;
  if (!(target instanceof HTMLElement) || isCleanWebElement(target)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const hideTarget = findSmartHideTarget(target);
  state.selectedElement = target;
  state.selectedTarget = hideTarget;

  // 隐藏悬停描边，显示选中描边
  state.hoverOutline.style.display = 'none';
  renderOutline(hideTarget);

  // 显示选择器标签
  const selector = buildReadableSelector(hideTarget);
  if (state.selectorLabel) {
    state.selectorLabel.textContent = selector;
    state.selectorLabel.title = selector;
  }

  renderToolbar(event.clientX, event.clientY);
}

function handlePickerKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    stopElementPicker();
  }
}

async function handleHideSelectedElement(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  const state = pickerState;
  const target = state?.selectedTarget;
  if (!target) return;

  const selector = buildReadableSelector(target);
  const css = `${selector} {\n  display: none !important;\n}`;
  const hostname = getHostname();
  const existingRule = await getRule(hostname);
  const nextCss = appendCssRule(existingRule?.css, css);

  injectCss(nextCss);
  await saveRule(hostname, {
    css: nextCss,
    instruction: appendInstruction(existingRule?.instruction, `隐藏 ${selector}`),
    updatedAt: Date.now(),
  });
  markRuleSaved(hostname);

  stopElementPicker();
}

function showAiPanel(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  const state = pickerState;
  if (!state) return;

  state.panel.style.display = 'flex';
}

function createPickerButton(label: string, icon: SVGElement, primary: boolean) {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'justify-content: center',
    'gap: 4px',
    'flex: 1',
    'height: 30px',
    'border: 0',
    'border-radius: 8px',
    'font-size: 12px',
    'font-weight: 600',
    'cursor: pointer',
    primary ? 'color: #ffffff' : 'color: #1f2a2e',
    primary ? 'background: #2e6f63' : 'background: rgb(46 111 99 / 8%)',
  ].join(';');

  const span = document.createElement('span');
  span.textContent = label;
  button.append(icon, span);
  return button;
}

function createTrashIcon() {
  const svg = createSvgIcon();
  svg.innerHTML = '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>';
  return svg;
}

function createSparkleIcon() {
  const svg = createSvgIcon();
  svg.innerHTML = '<path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/>';
  return svg;
}

function createSvgIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  return svg;
}

function createAiPanelContent() {
  const wrapper = document.createElement('div');

  const label = document.createElement('label');
  label.textContent = '局部 AI 指令';
  label.style.cssText = 'display:block;margin-bottom:4px;font-size:11px;font-weight:600;color:#8a9499';

  const input = document.createElement('textarea');
  input.rows = 3;
  input.placeholder = '例如：让这个区域更清爽';
  input.style.cssText = [
    'width: 100%',
    'box-sizing: border-box',
    'resize: none',
    'border: 1px solid rgb(230 228 223)',
    'border-radius: 8px',
    'padding: 8px',
    'font: inherit',
    'font-size: 12px',
    'line-height: 1.5',
    'color: #1f2a2e',
    'background: #ffffff',
    'outline: none',
  ].join(';');

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;justify-content:flex-end;gap:6px';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.textContent = '取消';
  cancelBtn.style.cssText = [
    'height:26px',
    'padding:0 10px',
    'border:1px solid rgb(230 228 223)',
    'border-radius:6px',
    'background:#ffffff',
    'font-size:11px',
    'font-weight:600',
    'color:#8a9499',
    'cursor:pointer',
  ].join(';');
  cancelBtn.addEventListener('click', (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    const state = pickerState;
    if (state) state.panel.style.display = 'none';
  });

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.textContent = '生成并应用';
  submitBtn.style.cssText = [
    'height:26px',
    'padding:0 10px',
    'border:0',
    'border-radius:6px',
    'background:#2e6f63',
    'font-size:11px',
    'font-weight:600',
    'color:#ffffff',
    'cursor:pointer',
  ].join(';');
  submitBtn.addEventListener('click', (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    // LLM 未接入：占位反馈
    input.value = '';
    input.placeholder = 'AI 接口接入后将在此生成规则…';
  });

  actions.append(cancelBtn, submitBtn);
  wrapper.append(label, input, actions);
  return wrapper;
}

function renderHoverOutline(element: HTMLElement) {
  const state = pickerState;
  if (!state?.hoverOutline) return;

  const rect = element.getBoundingClientRect();
  state.hoverOutline.style.display = 'block';
  state.hoverOutline.style.left = `${Math.max(0, rect.left)}px`;
  state.hoverOutline.style.top = `${Math.max(0, rect.top)}px`;
  state.hoverOutline.style.width = `${Math.max(0, rect.width)}px`;
  state.hoverOutline.style.height = `${Math.max(0, rect.height)}px`;
}

function renderOutline(element: HTMLElement) {
  const state = pickerState;
  if (!state) return;

  const rect = element.getBoundingClientRect();
  state.outline.style.display = 'block';
  state.outline.style.left = `${Math.max(0, rect.left)}px`;
  state.outline.style.top = `${Math.max(0, rect.top)}px`;
  state.outline.style.width = `${Math.max(0, rect.width)}px`;
  state.outline.style.height = `${Math.max(0, rect.height)}px`;
}

function renderToolbar(x: number, y: number) {
  const state = pickerState;
  if (!state) return;

  state.toolbar.style.display = 'flex';
  state.panel.style.display = 'none';
  positionFloatingElement(state.toolbar, x + 14, y + 14);
}

function positionFloatingElement(element: HTMLElement, x: number, y: number) {
  const rect = element.getBoundingClientRect();
  const left = Math.min(window.innerWidth - rect.width - 8, Math.max(8, x));
  const top = Math.min(window.innerHeight - rect.height - 8, Math.max(8, y));
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
}
function findSmartHideTarget(element: HTMLElement) {
  const viewportArea = window.innerWidth * window.innerHeight;
  let target = element;
  let current: HTMLElement | null = element;
  let depth = 0;

  while (current && depth < 4) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) {
      break;
    }

    if (isUnsafeHideTarget(parent, viewportArea)) {
      break;
    }

    if (shouldPromoteHideTarget(current, parent)) {
      target = parent;
      current = parent;
      depth += 1;
      continue;
    }

    break;
  }

  return target;
}

function shouldPromoteHideTarget(child: HTMLElement, parent: HTMLElement) {
  const childRect = child.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const childArea = getRectArea(childRect);
  const parentArea = getRectArea(parentRect);

  if (childArea < MIN_HIDE_TARGET_AREA || parentArea <= 0) {
    return false;
  }

  const areaRatio = childArea / parentArea;
  const parentLooksLikeContainer = hasContainerSignal(parent);

  return areaRatio > 0.72 || parentLooksLikeContainer;
}

function isUnsafeHideTarget(element: HTMLElement, viewportArea: number) {
  const tag = element.tagName.toLowerCase();
  const rect = element.getBoundingClientRect();
  const area = getRectArea(rect);

  return (
    tag === 'html' ||
    tag === 'body' ||
    tag === 'main' ||
    tag === 'article' ||
    area / viewportArea > MAX_HIDE_TARGET_AREA_RATIO
  );
}

function hasContainerSignal(element: HTMLElement) {
  const text = `${element.id} ${typeof element.className === 'string' ? element.className : ''}`.toLowerCase();
  return /ad|ads|advert|recommend|related|sidebar|card|item|container|wrapper|box|panel/.test(text);
}

function getRectArea(rect: DOMRect) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function isCleanWebElement(element: HTMLElement) {
  return Boolean(element.closest(`#${PICKER_LAYER_ID}`));
}

function appendCssRule(currentCss: string | undefined, nextRule: string) {
  if (!currentCss?.trim()) {
    return nextRule;
  }

  return `${currentCss.trim()}\n\n${nextRule}`;
}

function appendInstruction(currentInstruction: string | undefined, nextInstruction: string) {
  if (!currentInstruction?.trim()) {
    return nextInstruction;
  }

  return `${currentInstruction.trim()}；${nextInstruction}`;
}

export { buildReadableSelector, collectDomSummary };
export type { DomSummaryItem };

