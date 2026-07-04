import { browser } from 'wxt/browser';
import type {
  ApplyRuleMessage,
  CleanWebBackgroundMessage,
  CleanWebResponse,
  DomSummaryMessage,
  GeneratedRuleDraft,
  GenerationState,
  StartGenerationMessage,
} from '../types/cleanweb';
import { formatCssForPreview } from '../utils/css-format';
import { FALLBACK_CSS, generateCssRule } from '../utils/llm';
import { getGenerationState, saveGenerationState } from '../utils/storage';

export default defineBackground(() => {
  console.info('CleanWeb background ready', { id: browser.runtime.id });

  browser.runtime.onMessage.addListener((message: CleanWebBackgroundMessage): Promise<CleanWebResponse> => {
    if (message.type === 'CLEANWEB_START_GENERATION') {
      return runGenerationTask(message);
    }

    if (message.type === 'CLEANWEB_GET_GENERATION_STATE') {
      return getGenerationState(message.hostname).then((generationState) => ({
        ok: true,
        generationState: generationState ?? createIdleGenerationState(message.hostname),
      }));
    }

    if (message.type === 'CLEANWEB_CANCEL_GENERATION') {
      return cancelGenerationTask(message.hostname);
    }

    return Promise.resolve({ ok: false, error: 'Unknown background message type' });
  });
});

async function runGenerationTask(message: StartGenerationMessage): Promise<CleanWebResponse> {
  const now = Date.now();
  const runningState: GenerationState = {
    hostname: message.hostname,
    status: 'running',
    instruction: message.instruction,
    summaryCount: 0,
    startedAt: now,
    updatedAt: now,
  };

  await saveGenerationState(message.hostname, runningState);
  console.info('[CleanWeb][Background] generation started', {
    hostname: message.hostname,
    tabId: message.tabId,
    instruction: message.instruction,
  });

  try {
    const response = await browser.tabs.sendMessage(message.tabId, {
      type: 'CLEANWEB_COLLECT_DOM_SUMMARY',
    } satisfies DomSummaryMessage) as CleanWebResponse;

    const summary = response.summary ?? [];
    const summaryCount = response.summaryCount ?? summary.length;

    if (await isGenerationCanceled(message.hostname)) {
      return getCanceledGenerationResponse(message.hostname, runningState);
    }

    await saveGenerationState(message.hostname, {
      ...runningState,
      summaryCount,
      updatedAt: Date.now(),
    });

    const result = await generateCssRule({
      instruction: message.instruction,
      domSummary: summary,
      settings: message.settings,
    });

    if (await isGenerationCanceled(message.hostname)) {
      return getCanceledGenerationResponse(message.hostname, {
        ...runningState,
        summaryCount,
      });
    }

    const draft = createGeneratedRuleDraft({
      css: formatCssForPreview(result.css || FALLBACK_CSS),
      explanation: result.explanation,
      instruction: message.instruction,
      source: result.usedFallback ? 'fallback' : 'full-page',
      debug: result.debug,
    });
    const nextDrafts = [draft, ...message.existingDrafts].slice(0, 6);
    const css = getEnabledDraftCss(nextDrafts);

    await browser.tabs.sendMessage(message.tabId, {
      type: 'CLEANWEB_APPLY_RULE',
      css,
      instruction: getEnabledDraftInstruction(nextDrafts),
      save: true,
      drafts: nextDrafts,
    } satisfies ApplyRuleMessage);

    const successState: GenerationState = {
      hostname: message.hostname,
      status: 'success',
      instruction: message.instruction,
      summaryCount,
      startedAt: runningState.startedAt,
      updatedAt: Date.now(),
      draft,
      debug: result.debug,
    };
    await saveGenerationState(message.hostname, successState);

    console.info('[CleanWeb][Background] generation completed', {
      hostname: message.hostname,
      draftId: draft.id,
      cssLength: draft.css.length,
      summaryCount,
      explanation: draft.explanation,
    });

    return {
      ok: true,
      generationState: successState,
    };
  } catch (error) {
    const messageText = error instanceof Error ? error.message : 'Rule generation failed';
    const errorState: GenerationState = {
      hostname: message.hostname,
      status: 'error',
      instruction: message.instruction,
      summaryCount: 0,
      startedAt: runningState.startedAt,
      updatedAt: Date.now(),
      error: messageText,
    };

    await saveGenerationState(message.hostname, errorState);
    console.warn('[CleanWeb][Background] generation failed', {
      hostname: message.hostname,
      error: messageText,
    });

    return {
      ok: false,
      error: messageText,
      generationState: errorState,
    };
  }
}

async function cancelGenerationTask(hostname: string): Promise<CleanWebResponse> {
  const currentState = await getGenerationState(hostname);
  const now = Date.now();
  const canceledState: GenerationState = {
    hostname,
    status: 'canceled',
    instruction: currentState?.instruction ?? '',
    summaryCount: currentState?.summaryCount ?? 0,
    startedAt: currentState?.startedAt ?? now,
    updatedAt: now,
    debug: currentState?.debug,
  };

  await saveGenerationState(hostname, canceledState);
  console.info('[CleanWeb][Background] generation canceled', { hostname });

  return {
    ok: true,
    generationState: canceledState,
  };
}

async function isGenerationCanceled(hostname: string) {
  const state = await getGenerationState(hostname);
  return state?.status === 'canceled';
}

async function getCanceledGenerationResponse(
  hostname: string,
  previousState: Pick<GenerationState, 'instruction' | 'summaryCount' | 'startedAt'>,
): Promise<CleanWebResponse> {
  const state: GenerationState = {
    hostname,
    status: 'canceled',
    instruction: previousState.instruction,
    summaryCount: previousState.summaryCount,
    startedAt: previousState.startedAt,
    updatedAt: Date.now(),
  };

  await saveGenerationState(hostname, state);

  return {
    ok: true,
    generationState: state,
  };
}

function createGeneratedRuleDraft(input: Omit<GeneratedRuleDraft, 'id' | 'enabled' | 'createdAt'>): GeneratedRuleDraft {
  return {
    ...input,
    id: `${Date.now()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`,
    enabled: true,
    createdAt: Date.now(),
  };
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

  return `Enabled ${enabledDrafts.length} generated rules`;
}

function createIdleGenerationState(hostname: string): GenerationState {
  const now = Date.now();
  return {
    hostname,
    status: 'idle',
    instruction: '',
    summaryCount: 0,
    startedAt: now,
    updatedAt: now,
  };
}
