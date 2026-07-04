import type { DomSummaryItem, ElementContextItem, SelectedElementContext } from '../types/cleanweb';

const MAX_ITEMS = 80;
const TEXT_LIMIT = 80;
const MIN_AREA = 900;

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
  options: { ancestorDepth?: number; siblingCount?: number } = {},
): SelectedElementContext {
  const { ancestorDepth = 4, siblingCount = 4 } = options;

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

  return {
    selected,
    ancestors,
    siblings,
  };
}
