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
const MIN_HIDE_TARGET_AREA = 900;
const MAX_HIDE_TARGET_AREA_RATIO = 0.72;

let pickerState: PickerState | null = null;

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
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

      if (message.type === 'CLEANWEB_START_ELEMENT_PICKER') {
        startElementPicker();
        return Promise.resolve({ ok: true });
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

interface PickerState {
  hoveredElement: HTMLElement | null;
  selectedElement: HTMLElement | null;
  selectedTarget: HTMLElement | null;
  pointer: {
    x: number;
    y: number;
  };
  layer: HTMLDivElement;
  outline: HTMLDivElement;
  toolbar: HTMLDivElement;
  panel: HTMLDivElement;
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
    'font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  ].join(';');

  const outline = document.createElement('div');
  outline.id = PICKER_OUTLINE_ID;
  outline.style.cssText = [
    'position: fixed',
    'display: none',
    'z-index: 2147483646',
    'pointer-events: none',
    'border: 2px solid #2e6f63',
    'border-radius: 8px',
    'background: rgb(46 111 99 / 10%)',
    'box-shadow: 0 0 0 9999px rgb(23 32 38 / 12%)',
  ].join(';');

  const toolbar = document.createElement('div');
  toolbar.id = PICKER_TOOLBAR_ID;
  toolbar.style.cssText = [
    'position: fixed',
    'display: none',
    'z-index: 2147483647',
    'gap: 8px',
    'pointer-events: auto',
    'padding: 6px',
    'border: 1px solid rgb(216 212 202)',
    'border-radius: 14px',
    'background: rgb(255 253 248)',
    'box-shadow: 0 16px 44px rgb(23 32 38 / 22%)',
  ].join(';');

  const hideButton = createPickerIconButton('隐藏元素', createTrashIcon());
  hideButton.addEventListener('click', handleHideSelectedElement);
  const aiButton = createPickerIconButton('AI 修改', createSparkleIcon());
  aiButton.addEventListener('click', showAiPanel);
  toolbar.append(hideButton, aiButton);

  const panel = document.createElement('div');
  panel.id = PICKER_PANEL_ID;
  panel.style.cssText = [
    'position: fixed',
    'display: none',
    'z-index: 2147483647',
    'width: 260px',
    'pointer-events: auto',
    'padding: 10px',
    'border: 1px solid rgb(216 212 202)',
    'border-radius: 14px',
    'background: rgb(255 253 248)',
    'box-shadow: 0 16px 44px rgb(23 32 38 / 22%)',
    'color: #172026',
  ].join(';');
  panel.append(createAiPanelContent());

  layer.append(outline, toolbar, panel);
  document.documentElement.appendChild(layer);

  pickerState = {
    hoveredElement: null,
    selectedElement: null,
    selectedTarget: null,
    pointer: { x: 0, y: 0 },
    layer,
    outline,
    toolbar,
    panel,
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

  if (!state.selectedElement) {
    renderOutline(target);
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

  renderOutline(hideTarget);
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

  stopElementPicker();
}

function showAiPanel(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  const state = pickerState;
  if (!state) return;

  state.panel.style.display = 'block';
  positionFloatingElement(state.panel, state.pointer.x + 14, state.pointer.y + 14);
}

function createPickerIconButton(label: string, icon: SVGElement) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'justify-content: center',
    'width: 34px',
    'height: 34px',
    'border: 0',
    'border-radius: 10px',
    'color: #172026',
    'background: #f7f5ef',
    'cursor: pointer',
  ].join(';');
  button.append(icon);
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
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
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
  label.style.cssText = 'display:block;margin-bottom:7px;font-size:12px;font-weight:800;color:#57636b';

  const input = document.createElement('textarea');
  input.rows = 3;
  input.placeholder = '例如：让这个区域更清爽';
  input.disabled = true;
  input.style.cssText = [
    'width: 100%',
    'box-sizing: border-box',
    'resize: none',
    'border: 1px solid rgb(216 212 202)',
    'border-radius: 10px',
    'padding: 9px',
    'font: inherit',
    'font-size: 12px',
    'line-height: 1.5',
    'color: #57636b',
    'background: #f7f5ef',
  ].join(';');

  const note = document.createElement('p');
  note.textContent = 'AI 修改接口待接入';
  note.style.cssText = 'margin:8px 0 0;font-size:12px;font-weight:700;color:#57636b';

  wrapper.append(label, input, note);
  return wrapper;
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

  state.toolbar.style.display = 'inline-flex';
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
