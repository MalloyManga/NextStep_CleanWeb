import type { GeneratedRuleDraft } from '../types/cleanweb';

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
