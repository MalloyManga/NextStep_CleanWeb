import type { GeneratedRuleDraft } from '../types/cleanweb';
import { formatCssForPreview } from './css-format';

export function createRuleDraft(
  input: Omit<GeneratedRuleDraft, 'id' | 'enabled' | 'createdAt'>,
): GeneratedRuleDraft {
  return {
    ...input,
    css: formatCssForPreview(input.css),
    id: `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`,
    enabled: true,
    createdAt: Date.now(),
  };
}

export function getEnabledDraftCss(drafts: GeneratedRuleDraft[]): string {
  return drafts
    .filter((draft) => draft.enabled)
    .slice()
    .reverse()
    .map((draft) => draft.css)
    .join('\n\n');
}

export function getEnabledDraftInstruction(
  drafts: GeneratedRuleDraft[],
  fallback: (count: number) => string,
): string {
  const enabledDrafts = drafts.filter((draft) => draft.enabled);

  if (enabledDrafts.length === 1) {
    return enabledDrafts[0].instruction;
  }

  return fallback(enabledDrafts.length);
}
