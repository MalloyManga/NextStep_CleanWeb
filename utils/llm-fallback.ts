import type { SelectedElementContext } from '../types/cleanweb';

// 智能隐藏离线可用：AI 不可用或失败时，直接隐藏启发式选中的目标容器。
export function fallbackSmartHideCss(context: SelectedElementContext): string {
  const selector = context.recommendedTarget?.selector ?? context.selected.selector;
  return `${selector} {\n  display: none !important;\n}`;
}
