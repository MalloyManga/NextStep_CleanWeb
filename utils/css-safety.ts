import type {
  DomSummaryItem,
  ElementContextItem,
  SelectedElementContext,
} from '../types/cleanweb';

// ---- 整页净化 CSS 护栏 -------------------------------------------------

export function sanitizeGeneratedCss(css: string, domSummary: DomSummaryItem[], instruction: string) {
  const protectedTerms = getProtectedTerms(instruction);
  const rules: string[] = [];
  const chromeSelectors: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = rulePattern.exec(css)) !== null) {
    const beforeRule = css.slice(lastIndex, match.index).trim();
    if (beforeRule) {
      rules.push(beforeRule);
    }

    const selectorText = match[1].trim();
    const declarations = match[2].trim();
    const selectors = splitSelectorList(selectorText);
    const safeSelectors = declarationsHideElement(declarations)
      ? expandAdHideSelectors(selectors, domSummary).filter((selector) => !isUnsafeHideSelector(selector, domSummary, protectedTerms))
      : selectors.filter((selector) => !isUnsafeRestyleSelector(selector, declarations));
    const nextDeclarations = normalizeNestedCardChrome(safeSelectors, declarations, chromeSelectors);

    if (safeSelectors.length > 0 && nextDeclarations) {
      rules.push(`${safeSelectors.join(', ')} { ${nextDeclarations} }`);
    }

    lastIndex = rulePattern.lastIndex;
  }

  const trailingText = css.slice(lastIndex).trim();
  if (trailingText) {
    rules.push(trailingText);
  }

  return rules.join('\n\n').trim();
}

function expandAdHideSelectors(selectors: string[], domSummary: DomSummaryItem[]) {
  const expandedSelectors = new Set<string>();

  for (const selector of selectors) {
    expandedSelectors.add(selector);

    if (!isInnerAdAssetSelector(selector)) continue;

    for (const item of domSummary) {
      if (
        item.selector !== selector &&
        isLikelyAdSelector(item.selector, item) &&
        (item.iframeCount ?? 0) > 0
      ) {
        expandedSelectors.add(item.selector);
      }
    }
  }

  return Array.from(expandedSelectors);
}

function isInnerAdAssetSelector(selector: string) {
  return /iframe|img|carousel_item_iframe/i.test(selector);
}

function isUnsafeRestyleSelector(selector: string, declarations: string) {
  if (!/(display\s*:\s*(grid|flex)|grid-template|width\s*:|flex\s*:)/i.test(declarations)) {
    return false;
  }

  return /carousel|swiper|home-project-cont|el-carousel/i.test(selector);
}

function normalizeNestedCardChrome(selectors: string[], declarations: string, chromeSelectors: string[]) {
  if (!declarationsApplyCardChrome(declarations)) {
    return declarations;
  }

  const hasNestedConflict = selectors.some((selector) => (
    chromeSelectors.some((chromeSelector) => selectorsAreNested(selector, chromeSelector))
  ));
  const nextDeclarations = hasNestedConflict ? removeCardChromeDeclarations(declarations) : declarations;

  if (declarationsApplyCardChrome(nextDeclarations)) {
    chromeSelectors.push(...selectors);
  }

  return nextDeclarations;
}

function declarationsApplyCardChrome(declarations: string) {
  return /(^|;)\s*(box-shadow|border-radius|border(?:-[a-z-]+)?|outline(?:-[a-z-]+)?)\s*:/i.test(declarations);
}

function removeCardChromeDeclarations(declarations: string) {
  return declarations
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .filter((declaration) => !/^(box-shadow|border-radius|border(?:-[a-z-]+)?|outline(?:-[a-z-]+)?)\s*:/i.test(declaration))
    .join('; ');
}

function selectorsAreNested(selector: string, otherSelector: string) {
  return (
    selector.startsWith(`${otherSelector} `) ||
    selector.startsWith(`${otherSelector} >`) ||
    otherSelector.startsWith(`${selector} `) ||
    otherSelector.startsWith(`${selector} >`)
  );
}

function declarationsHideElement(declarations: string) {
  return /display\s*:\s*none\s*!?\s*important?/i.test(declarations);
}

function splitSelectorList(selectorText: string) {
  return selectorText
    .split(',')
    .map((selector) => selector.trim())
    .filter(Boolean);
}

function isUnsafeHideSelector(selector: string, domSummary: DomSummaryItem[], protectedTerms: string[]) {
  const normalizedSelector = selector.trim();
  const bareTagSelectors = new Set([
    '*',
    'html',
    'body',
    'main',
    'article',
    'section',
    'div',
    'aside',
    'header',
    'footer',
    'nav',
    'iframe',
    'img',
    'a',
    'button',
    'input',
  ]);

  if (bareTagSelectors.has(normalizedSelector.toLowerCase())) {
    return true;
  }

  if (/#app\b|#root\b|home-content|home_box_left|layout-content/i.test(normalizedSelector)) {
    return true;
  }

  const matchedSummary = domSummary.find((item) => item.selector === normalizedSelector);
  if (!matchedSummary) {
    return isLikelyLayoutSelector(normalizedSelector) && !isLikelyAdSelector(normalizedSelector);
  }

  if (isLikelyAdSelector(normalizedSelector, matchedSummary)) {
    return false;
  }

  if (isLargeContainer(matchedSummary) && !isLikelyAdSelector(normalizedSelector, matchedSummary)) {
    return true;
  }

  return protectedTerms.some((term) => matchedSummary.text.includes(term));
}

function isLikelyLayoutSelector(selector: string) {
  return /layout|content|container|wrapper|box|main|page|root/i.test(selector);
}

function isLikelyAdSelector(selector: string, item?: DomSummaryItem) {
  const text = `${selector} ${item?.id ?? ''} ${item?.className ?? ''} ${item?.text ?? ''}`.toLowerCase();
  return /(^|[-_\s.#])(ad|ads|advert|banner|promotion|sponsor|kp_box|carousel_item_iframe)([-_\s.#]|\d|$)/i.test(text);
}

function isLargeContainer(item: DomSummaryItem) {
  const viewportArea = 1920 * 1080;
  const itemArea = item.rect.width * item.rect.height;

  return (
    itemArea > viewportArea * 0.28 ||
    (item.childElementCount ?? 0) > 24 ||
    (item.linkCount ?? 0) > 18
  );
}

export function getProtectedTerms(instruction: string) {
  const fixedTerms = ['开源项目', '精选博客', '社区推荐', '正文', '搜索框', '搜索按钮'];
  const protectedTerms = new Set<string>();

  for (const term of fixedTerms) {
    if (instruction.includes(term)) {
      protectedTerms.add(term);
    }
  }

  const keepText = instruction.match(/(?:保留|只保留|仅保留)([^。；;]+)/)?.[1] ?? '';
  for (const term of keepText.split(/[、，,和与及\s]+/)) {
    const normalizedTerm = term.trim();
    if (normalizedTerm.length >= 2 && normalizedTerm.length <= 12) {
      protectedTerms.add(normalizedTerm);
    }
  }

  return Array.from(protectedTerms);
}

// ---- 元素级 CSS 护栏 ---------------------------------------------------

export function sanitizeSelectedElementCss(
  css: string,
  context: SelectedElementContext,
  options: {
    allowHide: boolean;
    maxAncestorDepth?: number;
    allowDescendants?: boolean;
    protectedTerms?: string[];
  },
) {
  if (!css.trim()) return '';

  const selectedSelectors = createScopedSelectorSet([
    context.selected.selector,
    context.recommendedTarget?.selector,
    ...(options.allowDescendants ? (context.descendants ?? []).map((descendant) => descendant.selector) : []),
    ...context.ancestors
      .filter((ancestor) => isSafeSelectedAncestor(ancestor, options.maxAncestorDepth))
      .map((ancestor) => ancestor.selector),
  ]);
  const rules: string[] = [];
  const chromeSelectors: string[] = [];
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = rulePattern.exec(css)) !== null) {
    const selectorText = match[1].trim();
    const declarations = match[2].trim();
    if (!options.allowHide && declarationsHideElement(declarations)) continue;

    const selectors = splitSelectorList(selectorText).filter((selector) => (
      isScopedToSelectedElement(selector, selectedSelectors) &&
      !isUnsafeSelectedElementHide(selector, declarations, context, options) &&
      !hidesProtectedSelectedContext(selector, declarations, context, options.protectedTerms ?? [])
    ));
    if (!declarations) continue;

    if (selectors.length > 0) {
      const nextDeclarations = normalizeNestedCardChrome(selectors, declarations, chromeSelectors);
      if (nextDeclarations) {
        rules.push(`${selectors.join(', ')} { ${nextDeclarations} }`);
      }
      continue;
    }

    if (!options.allowHide) {
      const fallbackSelector = getSelectedElementSelector(context);
      const nextDeclarations = normalizeNestedCardChrome([fallbackSelector], declarations, chromeSelectors);
      if (nextDeclarations) {
        rules.push(`${fallbackSelector} { ${nextDeclarations} }`);
      }
    }
  }

  return rules.join('\n\n').trim();
}

function isScopedToSelectedElement(selector: string, selectedSelectors: Set<string>) {
  const selectorAliases = getSelectorScopeAliases(selector);

  for (const selectedSelector of selectedSelectors) {
    for (const selectorAlias of selectorAliases) {
      if (selectorAlias === selectedSelector) return true;
      if (selectorAlias.startsWith(`${selectedSelector}:`)) return true;
      if (selectorAlias.startsWith(`${selectedSelector}[`)) return true;
      if (selectorAlias.startsWith(`${selectedSelector} `)) return true;
      if (selectorAlias.startsWith(`${selectedSelector} >`)) return true;
      if (selectorAlias.startsWith(`${selectedSelector} +`)) return true;
      if (selectorAlias.startsWith(`${selectedSelector} ~`)) return true;
    }
  }

  return false;
}

function createScopedSelectorSet(selectors: Array<string | undefined>) {
  const scopedSelectors = new Set<string>();

  for (const selector of selectors) {
    if (!selector) continue;
    for (const alias of getSelectorScopeAliases(selector)) {
      scopedSelectors.add(alias);
    }
  }

  return scopedSelectors;
}

function getSelectorScopeAliases(selector: string) {
  const trimmedSelector = selector.trim();
  const aliases = new Set([trimmedSelector]);
  const taglessSelector = trimmedSelector.replace(/^[a-z][a-z0-9-]*(?=[.#[:])/i, '');

  if (taglessSelector && taglessSelector !== trimmedSelector) {
    aliases.add(taglessSelector);
  }

  return Array.from(aliases);
}

function isUnsafeSelectedElementHide(
  selector: string,
  declarations: string,
  context: SelectedElementContext,
  options: { allowDescendants?: boolean },
) {
  if (!options.allowDescendants || !declarationsHideElement(declarations)) {
    return false;
  }

  const selectedSelector = context.selected.selector;
  const recommendedSelector = context.recommendedTarget?.selector;
  return selector === selectedSelector || selector === recommendedSelector;
}

function hidesProtectedSelectedContext(
  selector: string,
  declarations: string,
  context: SelectedElementContext,
  protectedTerms: string[],
) {
  if (protectedTerms.length === 0 || !declarationsHideElement(declarations)) {
    return false;
  }

  return getSelectedContextItems(context).some((item) => (
    selectorMatchesContextItem(selector, item.selector) &&
    protectedTerms.some((term) => item.text.includes(term))
  ));
}

function getSelectedContextItems(context: SelectedElementContext) {
  return [
    context.selected,
    ...(context.recommendedTarget ? [context.recommendedTarget] : []),
    ...context.ancestors,
    ...context.siblings,
    ...(context.descendants ?? []),
  ];
}

function selectorMatchesContextItem(selector: string, itemSelector: string) {
  const selectorAliases = getSelectorScopeAliases(selector);
  const itemAliases = getSelectorScopeAliases(itemSelector);

  return selectorAliases.some((selectorAlias) => (
    itemAliases.some((itemAlias) => (
      selectorAlias === itemAlias ||
      selectorAlias.startsWith(`${itemAlias} `) ||
      selectorAlias.startsWith(`${itemAlias} >`) ||
      itemAlias.startsWith(`${selectorAlias} `) ||
      itemAlias.startsWith(`${selectorAlias} >`)
    ))
  ));
}

export function getSelectedElementSelector(context: SelectedElementContext) {
  return context.recommendedTarget?.selector ?? context.selected.selector;
}

function isSafeSelectedAncestor(ancestor: ElementContextItem, maxDepth?: number) {
  return (
    (maxDepth === undefined || ancestor.depth <= maxDepth) &&
    ancestor.tag !== 'main' &&
    ancestor.tag !== 'article' &&
    (ancestor.areaRatio ?? 0) <= 0.7 &&
    (ancestor.linkCount ?? 0) <= 16 &&
    (ancestor.buttonCount ?? 0) <= 8
  );
}

export function isSidebarLikeContext(item: ElementContextItem) {
  const target = `${item.selector} ${item.id ?? ''} ${item.className ?? ''} ${item.role ?? ''}`.toLowerCase();
  return /sidebar|side-bar|sider|aside|nav|menu|left/.test(target);
}

export function hasExplicitHideIntent(instruction: string) {
  return /hide|remove|delete|discard|隐藏|移除|删除|去掉|删掉/.test(instruction);
}
