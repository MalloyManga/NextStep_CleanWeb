import { browser } from 'wxt/browser';
import type {
  AiModifyMessage,
  AiModifyResult,
  ApplyRuleMessage,
  CleanWebMessage,
  CleanWebResponse,
  DomSummaryItem,
  GeneratedRuleDraft,
  SmartHideMessage,
  SmartHideResult,
} from '../types/cleanweb';
import { formatCssForPreview } from '../utils/css-format';
import { buildReadableSelector, collectDomSummary, collectElementContext, toElementContextItem } from '../utils/dom-summary';
import { getHostname, getRule, removeRule, saveRule } from '../utils/storage';

const STYLE_ID = 'cleanweb-generated-style';
const PICKER_LAYER_ID = 'cleanweb-picker-layer';
const PICKER_OUTLINE_ID = 'cleanweb-picker-outline';
const PICKER_TOOLBAR_ID = 'cleanweb-picker-toolbar';
const PICKER_PANEL_ID = 'cleanweb-picker-ai-panel';
const PICKER_SPINNER_CLASS = 'cleanweb-picker-spinner';
const GUARD_STYLE_ID = 'cleanweb-anti-flicker-style';
const GUARD_CLASS = 'cleanweb-anti-flicker';
const RULE_MARKER_PREFIX = 'cleanweb:has-rule:';
const GUARD_FAILSAFE_MS = 1500;
const MIN_HIDE_TARGET_AREA = 900;
const MAX_HIDE_TARGET_AREA_RATIO = 0.72;
const MAX_SMART_HIDE_PARENT_DEPTH = 2;

let pickerState: PickerState | null = null;

const onPickerMouseMove: EventListener = (event) => {
  if (event instanceof MouseEvent) {
    handlePickerMouseMove(event);
  }
};

const onPickerPointerGuard: EventListener = (event) => {
  if (event instanceof MouseEvent || event instanceof PointerEvent) {
    guardPickerPointerEvent(event);
  }
};

const onPickerClick: EventListener = (event) => {
  if (event instanceof MouseEvent) {
    handlePickerClick(event);
  }
};

const onPickerKeyDown: EventListener = (event) => {
  if (event instanceof KeyboardEvent) {
    handlePickerKeyDown(event);
  }
};

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
  statusBar: HTMLDivElement;
  hiddenCount: number;
}

function startElementPicker() {
  stopElementPicker();

  const layer = document.createElement('div');
  layer.id = PICKER_LAYER_ID;
  layer.style.cssText = [
    'position: fixed',
    'inset: 0',
    'z-index: 2147483646',
    'pointer-events: auto',
    'cursor: crosshair',
    'font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
  ].join(';');

  const pickerStyle = document.createElement('style');
  pickerStyle.textContent = `
    @keyframes cleanweb-picker-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .${PICKER_SPINNER_CLASS} {
      animation: cleanweb-picker-spin 0.8s linear infinite;
      transform-box: fill-box;
      transform-origin: center;
    }
  `;

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
    'min-width: 200px',
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
  head.append(selectorLabel);

  // 按钮行
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:6px;flex-wrap:nowrap';

  const hideButton = createPickerButton('智能隐藏', createTrashIcon(), true);
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

  // 连续选择状态条：常驻左上角，显示已处理数 + 退出提示
  const statusBar = document.createElement('div');
  statusBar.style.cssText = [
    'position: fixed',
    'top: 12px',
    'left: 12px',
    'z-index: 2147483647',
    'pointer-events: none',
    'display: inline-flex',
    'align-items: center',
    'gap: 6px',
    'padding: 5px 10px',
    'border-radius: 999px',
    'background: rgb(23 32 38 / 78%)',
    'color: #ffffff',
    'font-size: 12px',
    'font-weight: 600',
    'backdrop-filter: blur(6px)',
  ].join(';');
  statusBar.textContent = '点击元素处理 · 按 Esc 完成';

  layer.append(pickerStyle, hoverOutline, selectOutline, toolbar, statusBar);
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
    statusBar,
    hiddenCount: 0,
  };

  addPickerEventListeners();
  console.info('[CleanWeb][Picker] started');
}

function stopElementPicker() {
  if (!pickerState) return;

  removePickerEventListeners();
  pickerState.layer.remove();
  pickerState = null;
  console.info('[CleanWeb][Picker] stopped');
}

function addPickerEventListeners() {
  for (const target of getPickerEventTargets()) {
    target.addEventListener('mousemove', onPickerMouseMove, true);
    target.addEventListener('pointerdown', onPickerPointerGuard, true);
    target.addEventListener('mousedown', onPickerPointerGuard, true);
    target.addEventListener('mouseup', onPickerPointerGuard, true);
    target.addEventListener('auxclick', onPickerPointerGuard, true);
    target.addEventListener('dblclick', onPickerPointerGuard, true);
    target.addEventListener('click', onPickerClick, true);
    target.addEventListener('keydown', onPickerKeyDown, true);
  }
}

function removePickerEventListeners() {
  for (const target of getPickerEventTargets()) {
    target.removeEventListener('mousemove', onPickerMouseMove, true);
    target.removeEventListener('pointerdown', onPickerPointerGuard, true);
    target.removeEventListener('mousedown', onPickerPointerGuard, true);
    target.removeEventListener('mouseup', onPickerPointerGuard, true);
    target.removeEventListener('auxclick', onPickerPointerGuard, true);
    target.removeEventListener('dblclick', onPickerPointerGuard, true);
    target.removeEventListener('click', onPickerClick, true);
    target.removeEventListener('keydown', onPickerKeyDown, true);
  }
}

function getPickerEventTargets(): EventTarget[] {
  return [window, document, document.documentElement];
}

function handlePickerMouseMove(event: MouseEvent) {
  const state = pickerState;
  if (!state) return;

  state.pointer = { x: event.clientX, y: event.clientY };

  const target = getPickerEventElement(event);
  if (!target) {
    return;
  }

  state.hoveredElement = target;
  const hideTarget = findSmartHideTarget(target);

  // 未选中时显示实际将要处理的目标，避免 hover 和点击结果不一致。
  if (!state.selectedElement) {
    renderHoverOutline(hideTarget);
  }
}

function guardPickerPointerEvent(event: MouseEvent | PointerEvent) {
  const state = pickerState;
  if (!state) return;

  const target = getEventTargetElement(event);
  if (target && isCleanWebControlElement(target)) {
    return;
  }

  suppressPageEvent(event);
}

function getPickerEventElement(event: Event) {
  if (event instanceof MouseEvent) {
    const element = getPageElementAtPoint(event.clientX, event.clientY);
    if (element) return element;
  }

  return getEventTargetElement(event);
}

function getEventTargetElement(event: Event) {
  for (const item of event.composedPath()) {
    const element = toHtmlElement(item);
    if (element) return element;
  }

  return toHtmlElement(event.target);
}

function getPageElementAtPoint(x: number, y: number) {
  for (const element of document.elementsFromPoint(x, y)) {
    const htmlElement = toHtmlElement(element);
    if (!htmlElement || isCleanWebElement(htmlElement)) continue;
    return htmlElement;
  }

  return null;
}

function toHtmlElement(value: EventTarget | Element | null) {
  if (value instanceof HTMLElement) return value;
  if (value instanceof SVGElement) return value.parentElement;
  return null;
}

function suppressPageEvent(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function handlePickerClick(event: MouseEvent) {
  const state = pickerState;
  if (!state) return;

  const eventTarget = getEventTargetElement(event);
  if (eventTarget && isCleanWebControlElement(eventTarget)) {
    return;
  }

  suppressPageEvent(event);

  const target = getPickerEventElement(event);
  if (!target) {
    return;
  }

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
    suppressPageEvent(event);
    stopElementPicker();
  }
}

async function handleHideSelectedElement(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  const button = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null;
  if (button?.disabled) return;

  const state = pickerState;
  const target = state?.selectedElement;
  const hideTarget = state?.selectedTarget;
  if (!target || !hideTarget) return;

  setPickerButtonLoading(button, '处理中');
  if (state) {
    state.statusBar.textContent = '智能隐藏生成中…';
  }

  try {
    const context = collectElementContext(target, { ancestorDepth: 4, siblingCount: 4 });
    context.recommendedTarget = toElementContextItem(hideTarget);

    const message: SmartHideMessage = { type: 'CLEANWEB_SMART_HIDE', context };
    const response = await browser.runtime.sendMessage(message);
    if (!response?.ok || !response.result) {
      if (state) {
        state.statusBar.textContent = response?.error || '智能隐藏失败 · 继续选择或按 Esc 完成';
      }
      return;
    }
    const result = response.result as SmartHideResult;

    const hostname = getHostname();
    const existingRule = await getRule(hostname);
    const draft = createElementRuleDraft({
      css: result.css,
      explanation: result.explanation,
      instruction: `隐藏 ${result.selector}`,
      source: 'smart-hide',
    });
    const nextDrafts = addRuleDraft(existingRule, draft);
    const nextCss = getEnabledDraftCss(nextDrafts);

    injectCss(nextCss);
    await saveRule(hostname, {
      css: nextCss,
      instruction: getEnabledDraftInstruction(nextDrafts),
      updatedAt: Date.now(),
      drafts: nextDrafts,
    });
    markRuleSaved(hostname);

    // 连续选择：计数 + 继续，不退出
    if (state) {
      state.hiddenCount += 1;
    }
    continuePicking();
  } catch (error) {
    if (state) {
      state.statusBar.textContent = error instanceof Error ? error.message : '智能隐藏失败';
    }
  } finally {
    restorePickerButton(button, '智能隐藏', createTrashIcon());
  }
}

// 连续选择：隐藏后重置选中态，恢复悬停，更新状态条
function continuePicking() {
  const state = pickerState;
  if (!state) return;

  state.selectedElement = null;
  state.selectedTarget = null;
  state.outline.style.display = 'none';
  state.toolbar.style.display = 'none';
  state.panel.style.display = 'none';

  const n = state.hiddenCount;
  state.statusBar.textContent = n > 0 ? `已处理 ${n} 项 · 继续选择或按 Esc 完成` : '选择目标元素 · 按 Esc 完成';
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
    'flex: 0 0 auto',
    'min-width: 88px',
    'height: 30px',
    'padding: 0 10px',
    'border: 0',
    'border-radius: 8px',
    'font-size: 12px',
    'font-weight: 600',
    'line-height: 1',
    'white-space: nowrap',
    'cursor: pointer',
    primary ? 'color: #ffffff' : 'color: #1f2a2e',
    primary ? 'background: #2e6f63' : 'background: rgb(46 111 99 / 8%)',
  ].join(';');

  const span = document.createElement('span');
  span.textContent = label;
  span.style.cssText = 'white-space:nowrap;word-break:keep-all';
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

function createSpinnerIcon() {
  const svg = createSvgIcon();
  svg.classList.add(PICKER_SPINNER_CLASS);
  svg.innerHTML = '<path d="M21 12a9 9 0 1 1-3.2-6.9"/>';
  return svg;
}

function setPickerButtonLoading(button: HTMLButtonElement | null, label: string) {
  if (!button) return;

  button.disabled = true;
  restorePickerButton(button, label, createSpinnerIcon());
  button.style.opacity = '0.9';
}

function restorePickerButton(button: HTMLButtonElement | null, label: string, icon: SVGElement) {
  if (!button) return;

  button.disabled = false;
  button.style.opacity = '';

  const span = document.createElement('span');
  span.textContent = label;
  span.style.cssText = 'white-space:nowrap;word-break:keep-all';
  button.replaceChildren(icon, span);
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
  submitBtn.addEventListener('click', async (event: Event) => {
    event.preventDefault();
    event.stopPropagation();

    const state = pickerState;
    const target = state?.selectedTarget;
    if (!target) return;

    const instruction = input.value.trim();
    if (!instruction) {
      input.placeholder = '请输入指令…';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '生成中…';

    try {
      const context = collectElementContext(target, { ancestorDepth: 4, siblingCount: 4 });
      context.recommendedTarget = toElementContextItem(target);

      const message: AiModifyMessage = { type: 'CLEANWEB_AI_MODIFY', instruction, context };
      const response = await browser.runtime.sendMessage(message);
      if (!response?.ok || !response.result) {
        input.placeholder = response?.error || 'AI 修改失败';
        input.value = '';
        return;
      }
      const result = response.result as AiModifyResult;

      if (!result.css) {
        input.placeholder = '未生成可用 CSS，请换个说法';
        input.value = '';
        if (state) {
          state.statusBar.textContent = 'AI 修改没有生成可应用规则 · 继续选择或按 Esc 完成';
        }
        return;
      }

      const hostname = getHostname();
      const existingRule = await getRule(hostname);
      const draft = createElementRuleDraft({
        css: result.css,
        explanation: result.explanation,
        instruction,
        source: 'ai-modify',
      });
      const nextDrafts = addRuleDraft(existingRule, draft);
      const nextCss = getEnabledDraftCss(nextDrafts);

      injectCss(nextCss);
      await saveRule(hostname, {
        css: nextCss,
        instruction: getEnabledDraftInstruction(nextDrafts),
        updatedAt: Date.now(),
        drafts: nextDrafts,
      });
      markRuleSaved(hostname);

      input.value = '';
      input.placeholder = '已应用';

      if (state) {
        state.hiddenCount += 1;
      }
      continuePicking();
    } catch (error) {
      input.placeholder = error instanceof Error ? error.message : 'AI 修改失败';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '生成并应用';
    }
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

  while (current && depth < MAX_SMART_HIDE_PARENT_DEPTH) {
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

function isCleanWebControlElement(element: HTMLElement) {
  return Boolean(element.closest(`#${PICKER_TOOLBAR_ID}`));
}

function createElementRuleDraft(input: Omit<GeneratedRuleDraft, 'id' | 'enabled' | 'createdAt'>): GeneratedRuleDraft {
  return {
    ...input,
    id: `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`,
    css: formatCssForPreview(input.css),
    enabled: true,
    createdAt: Date.now(),
  };
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

function getEnabledDraftCss(drafts: GeneratedRuleDraft[]) {
  return drafts
    .filter((draft) => draft.enabled)
    .slice()
    .reverse()
    .map((draft) => draft.css)
    .join('\n\n');
}

function getEnabledDraftInstruction(drafts: GeneratedRuleDraft[]) {
  const enabledDrafts = drafts.filter((draft) => draft.enabled);

  if (enabledDrafts.length === 1) {
    return enabledDrafts[0].instruction;
  }

  return `已启用 ${enabledDrafts.length} 条规则`;
}

export { buildReadableSelector, collectDomSummary };
export type { DomSummaryItem };

