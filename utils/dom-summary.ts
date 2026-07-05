import type { DomSummaryItem, ElementContextItem, SelectedElementContext } from '../types/cleanweb';

const MAX_ITEMS = 120;
const TEXT_LIMIT = 80;
const MIN_AREA = 900;
const DEFAULT_DESCENDANT_COUNT = 12;

export function collectDomSummary(): DomSummaryItem[] {
  const elements = Array.from(document.querySelectorAll('body *')).filter(
    (element): element is HTMLElement => element instanceof HTMLElement,
  );

  return elements
    .map(toSummaryItem)
    .filter((item): item is DomSummaryItem => Boolean(item))
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    .slice(0, MAX_ITEMS);
}

function toSummaryItem(element: HTMLElement): DomSummaryItem | null {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    Number(style.opacity) === 0 ||
    rect.width * rect.height < MIN_AREA
  ) {
    return null;
  }

  const text = normalizeText(element.innerText).slice(0, TEXT_LIMIT);

  return {
    selector: buildReadableSelector(element),
    tag: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: typeof element.className === 'string' ? element.className.slice(0, 120) : undefined,
    role: element.getAttribute('role') || undefined,
    ariaLabel: element.getAttribute('aria-label') || undefined,
    text,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    visible: true,
    childElementCount: element.children.length,
    imageCount: element.querySelectorAll('img').length,
    iframeCount: element.querySelectorAll('iframe').length,
    linkCount: element.querySelectorAll('a').length,
    inputCount: element.querySelectorAll('input, textarea, select').length,
    buttonCount: element.querySelectorAll('button, [role="button"]').length,
  };
}

export function buildReadableSelector(element: HTMLElement): string {
  if (element.id) {
    return `#${CSS.escape(element.id)}`;
  }

  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return `${element.tagName.toLowerCase()}[aria-label="${cssStringEscape(ariaLabel)}"]`;
  }

  const role = element.getAttribute('role');
  if (role) {
    return `${element.tagName.toLowerCase()}[role="${cssStringEscape(role)}"]`;
  }

  const classSelector = Array.from(element.classList)
    .filter((className) => /^[a-zA-Z0-9_-]+$/.test(className))
    .slice(0, 3)
    .map((className) => `.${CSS.escape(className)}`)
    .join('');

  if (classSelector) {
    return `${element.tagName.toLowerCase()}${classSelector}`;
  }

  return element.tagName.toLowerCase();
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function cssStringEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function toElementContextItem(element: HTMLElement, depth = 0): ElementContextItem {
  const rect = element.getBoundingClientRect();
  const viewportArea = window.innerWidth * window.innerHeight;
  const area = Math.max(0, rect.width) * Math.max(0, rect.height);
  const text = normalizeText(element.innerText).slice(0, TEXT_LIMIT);

  return {
    selector: buildReadableSelector(element),
    tag: element.tagName.toLowerCase(),
    id: element.id || undefined,
    className: typeof element.className === 'string' ? element.className.slice(0, 120) : undefined,
    role: element.getAttribute('role') || undefined,
    ariaLabel: element.getAttribute('aria-label') || undefined,
    text,
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    depth,
    areaRatio: viewportArea > 0 ? area / viewportArea : 0,
    visible: true,
  };
}

export function collectElementContext(
  element: HTMLElement,
  options: { ancestorDepth?: number; siblingCount?: number; descendantCount?: number } = {},
): SelectedElementContext {
  const {
    ancestorDepth = 4,
    siblingCount = 4,
    descendantCount = DEFAULT_DESCENDANT_COUNT,
  } = options;

  const selected = toElementContextItem(element, 0);
  const ancestors: ElementContextItem[] = [];
  let current: HTMLElement | null = element.parentElement;
  let depth = 1;

  while (current && depth <= ancestorDepth) {
    ancestors.push(toElementContextItem(current, depth));
    current = current.parentElement;
    depth += 1;
  }

  const siblings: ElementContextItem[] = [];
  if (element.parentElement) {
    const children = Array.from(element.parentElement.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child !== element,
    );
    for (const child of children.slice(0, siblingCount)) {
      siblings.push(toElementContextItem(child, 0));
    }
  }

  const descendants = collectVisibleDescendants(element, descendantCount);

  return {
    selected,
    ancestors,
    siblings,
    descendants,
  };
}

function collectVisibleDescendants(element: HTMLElement, limit: number): ElementContextItem[] {
  if (limit <= 0) return [];

  return Array.from(element.querySelectorAll('*'))
    .filter((child): child is HTMLElement => child instanceof HTMLElement)
    .map((child) => toDescendantContextItem(element, child))
    .filter((item): item is ElementContextItem => Boolean(item))
    .sort((a, b) => getElementContextScore(b) - getElementContextScore(a))
    .slice(0, limit);
}

function toDescendantContextItem(root: HTMLElement, child: HTMLElement): ElementContextItem | null {
  const style = window.getComputedStyle(child);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    Number(style.opacity) === 0
  ) {
    return null;
  }

  const item = toElementContextItem(child, getDescendantDepth(root, child));
  if (
    !item.visible ||
    item.rect.width * item.rect.height < MIN_AREA ||
    item.selector === buildReadableSelector(root)
  ) {
    return null;
  }

  return item;
}

function getDescendantDepth(root: HTMLElement, child: HTMLElement): number {
  let depth = 0;
  let current: HTMLElement | null = child;

  while (current && current !== root) {
    depth += 1;
    current = current.parentElement;
  }

  return depth;
}

function getElementContextScore(item: ElementContextItem) {
  const area = item.rect.width * item.rect.height;
  const textScore = item.text.length > 0 ? 12000 : 0;
  const semanticScore = item.id || item.role || item.ariaLabel ? 8000 : 0;
  const interactiveScore = (item.linkCount ?? 0) + (item.buttonCount ?? 0) + (item.inputCount ?? 0);

  return area + textScore + semanticScore + interactiveScore * 1200;
}
