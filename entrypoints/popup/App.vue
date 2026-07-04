<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { browser } from 'wxt/browser'
import { storage } from 'wxt/utils/storage'
import CleanModePanel from '../../components/popup/CleanModePanel.vue'
import ModeTabs from '../../components/popup/ModeTabs.vue'
import PopupHeader from '../../components/popup/PopupHeader.vue'
import SelectModePanel from '../../components/popup/SelectModePanel.vue'
import SettingsPanel from '../../components/popup/SettingsPanel.vue'
import StatusBar from '../../components/popup/StatusBar.vue'
import type { WorkMode } from '../../components/popup/types'
import type {
  ApplyRuleMessage,
  AiDebugLog,
  CleanWebResponse,
  GeneratedRuleDraft,
  GenerationState,
  GetGenerationStateMessage,
  LlmSettings,
  ResetRuleMessage,
  StartGenerationMessage,
  StartElementPickerMessage,
} from '../../types/cleanweb'
import { getLlmSettings, getRule, saveLlmSettings } from '../../utils/storage'

const MODE_STORAGE_KEY = 'local:cleanweb:popup-mode'

const instruction = ref('')
const generatedCss = ref('')
const generatedRuleDrafts = ref<GeneratedRuleDraft[]>([])
const selectedDraftId = ref<string | null>(null)
const latestAiDebugLog = ref<AiDebugLog | null>(null)
const status = ref('准备净化当前页面')
const currentSite = ref('当前页面')
const currentHostname = ref('')
const isBusy = ref(false)
const summaryCount = ref(0)
const mode = ref<WorkMode>('clean')
const ready = ref(false)
const hasGenerated = ref(false)
const hasSavedRule = ref(false)
let generationPollId: number | undefined
const llmSettings = ref<LlmSettings>({
  apiKey: '',
  baseUrl: '',
  model: 'gpt-4o-mini',
})

const hasApiKey = computed(() => llmSettings.value.apiKey.trim().length > 0)
const selectedAiDebugText = computed(() => {
  const selectedDraft = generatedRuleDrafts.value.find((draft) => draft.id === selectedDraftId.value)
  const debug = selectedDraft?.debug ?? latestAiDebugLog.value
  if (!debug) return ''

  return formatAiDebugLog(debug)
})

onMounted(async () => {
  currentSite.value = await getCurrentSiteLabel()
  currentHostname.value = await getCurrentHostname()
  mode.value = await getSavedMode()
  llmSettings.value = await getSavedLlmSettings()
  await loadSavedRuleState()
  await restoreGenerationState()
  ready.value = true
})

onUnmounted(() => {
  stopGenerationPolling()
})

watch(mode, (nextMode) => {
  if (!ready.value) return
  storage.setItem(MODE_STORAGE_KEY, nextMode)
})

async function getActiveTabId() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    throw new Error('没有找到当前标签页')
  }
  return tab.id
}

async function getCurrentSiteLabel() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return getHostnameLabel(tab?.url)
}

async function getCurrentHostname() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return ''

  try {
    return new URL(tab.url).hostname
  } catch {
    return ''
  }
}

function getHostnameLabel(url: string | undefined) {
  if (!url) return '当前页面'

  try {
    return getOriginLabel(url)
  } catch {
    return url.replace(/^(https?:\/\/[^/]+).*/i, '$1')
  }
}

function getOriginLabel(url: string) {
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
    return parsedUrl.origin
  }

  return parsedUrl.hostname || '当前页面'
}

async function loadSavedRuleState() {
  if (!currentHostname.value) {
    hasSavedRule.value = false
    return
  }

  const rule = await getRule(currentHostname.value)
  hasSavedRule.value = Boolean(rule?.css.trim())

  if (!rule?.drafts?.length) {
    return
  }

  generatedRuleDrafts.value = rule.drafts
  selectedDraftId.value = rule.drafts[0]?.id ?? null
  generatedCss.value = rule.drafts[0]?.css ?? ''
  hasGenerated.value = rule.drafts.length > 0
}

async function getSavedMode() {
  const savedMode = await storage.getItem<WorkMode>(MODE_STORAGE_KEY)
  return isWorkMode(savedMode) ? savedMode : 'clean'
}

function isWorkMode(value: unknown): value is WorkMode {
  return value === 'clean' || value === 'select' || value === 'settings'
}

async function getSavedLlmSettings(): Promise<LlmSettings> {
  const saved = await getLlmSettings()

  return {
    apiKey: saved?.apiKey ?? '',
    baseUrl: saved?.baseUrl || '',
    model: saved?.model || 'gpt-4o-mini',
  }
}

async function saveSettings() {
  isBusy.value = true
  status.value = '正在保存 AI 设置'

  try {
    await saveLlmSettings({
      apiKey: llmSettings.value.apiKey.trim(),
      baseUrl: llmSettings.value.baseUrl.trim(),
      model: llmSettings.value.model.trim() || 'gpt-4o-mini',
    })
    status.value = 'AI 设置已保存'
  } catch (error) {
    status.value = error instanceof Error ? error.message : '保存 AI 设置失败'
  } finally {
    isBusy.value = false
  }
}

async function sendToActiveTab<TMessage, TResponse = CleanWebResponse>(message: TMessage) {
  const tabId = await getActiveTabId()
  return browser.tabs.sendMessage(tabId, message) as Promise<TResponse>
}

function sendToBackground<TMessage, TResponse = CleanWebResponse>(message: TMessage) {
  return browser.runtime.sendMessage(message) as Promise<TResponse>
}

async function collectDomSummary() {
  isBusy.value = true
  status.value = '正在后台生成规则'

  try {
    console.info('[CleanWeb][Popup] start generation', {
      instruction: instruction.value,
      site: currentSite.value,
    })

    const response = await sendToBackground<StartGenerationMessage, CleanWebResponse>({
      type: 'CLEANWEB_START_GENERATION',
      tabId: await getActiveTabId(),
      hostname: currentHostname.value,
      instruction: instruction.value,
      settings: llmSettings.value,
      existingDrafts: generatedRuleDrafts.value,
    })

    if (response.generationState) {
      await syncGenerationState(response.generationState)
      return
    }

    await loadSavedRuleState()
    status.value = response.ok ? '规则已应用并保存' : response.error ?? '生成规则失败'
  } catch (error) {
    status.value = error instanceof Error ? error.message : '生成规则失败'
  } finally {
    isBusy.value = false
  }
}

async function resetPage() {
  isBusy.value = true
  status.value = '正在恢复页面'

  try {
    await sendToActiveTab<ResetRuleMessage>({
      type: 'CLEANWEB_RESET_RULE',
    })
    status.value = '页面已恢复'
    hasSavedRule.value = false
    hasGenerated.value = false
    generatedCss.value = ''
    generatedRuleDrafts.value = []
    selectedDraftId.value = null
  } catch (error) {
    status.value = error instanceof Error ? error.message : '恢复页面失败'
  } finally {
    isBusy.value = false
  }
}

function prepareElementPicker() {
  mode.value = 'select'
  startElementPicker()
}

function getEnabledDraftCss() {
  return generatedRuleDrafts.value
    .filter((draft) => draft.enabled)
    .slice()
    .reverse()
    .map((draft) => draft.css)
    .join('\n\n')
}

function getEnabledDraftInstruction() {
  const enabledDrafts = generatedRuleDrafts.value.filter((draft) => draft.enabled)

  if (enabledDrafts.length === 1) {
    return enabledDrafts[0].instruction
  }

  return `已启用 ${enabledDrafts.length} 条生成规则`
}

async function applyEnabledDrafts() {
  const css = getEnabledDraftCss()

  await sendToActiveTab<ApplyRuleMessage>({
    type: 'CLEANWEB_APPLY_RULE',
    css,
    instruction: getEnabledDraftInstruction(),
    save: true,
    drafts: generatedRuleDrafts.value,
  })

  hasSavedRule.value = css.trim().length > 0
}

async function restoreGenerationState() {
  if (!currentHostname.value) return

  const response = await sendToBackground<GetGenerationStateMessage, CleanWebResponse>({
    type: 'CLEANWEB_GET_GENERATION_STATE',
    hostname: currentHostname.value,
  })

  if (!response.generationState) return
  await syncGenerationState(response.generationState)
}

async function syncGenerationState(generationState: GenerationState) {
  if (generationState.status === 'running') {
    latestAiDebugLog.value = generationState.debug ?? latestAiDebugLog.value
    summaryCount.value = generationState.summaryCount
    isBusy.value = true
    status.value = generationState.summaryCount > 0
      ? `已读取 ${generationState.summaryCount} 个元素，正在后台生成规则`
      : '正在后台读取页面结构'
    startGenerationPolling()
    return
  }

  stopGenerationPolling()
  isBusy.value = false

  if (generationState.status === 'success') {
    latestAiDebugLog.value = generationState.debug ?? generationState.draft?.debug ?? latestAiDebugLog.value
    summaryCount.value = generationState.summaryCount
    await loadSavedRuleState()
    status.value = getStatusPreview(generationState.draft?.explanation || '规则已应用并保存')
    return
  }

  if (generationState.status === 'error') {
    latestAiDebugLog.value = generationState.debug ?? latestAiDebugLog.value
    status.value = generationState.error ?? '生成规则失败'
  }
}

function startGenerationPolling() {
  if (generationPollId !== undefined) return

  generationPollId = window.setInterval(() => {
    restoreGenerationState().catch((error: unknown) => {
      status.value = error instanceof Error ? error.message : '读取生成状态失败'
      stopGenerationPolling()
      isBusy.value = false
    })
  }, 1000)
}

function stopGenerationPolling() {
  if (generationPollId === undefined) return

  window.clearInterval(generationPollId)
  generationPollId = undefined
}

function selectRuleDraft(id: string) {
  const draft = generatedRuleDrafts.value.find((item) => item.id === id)
  if (!draft) return

  selectedDraftId.value = draft.id
  generatedCss.value = draft.css
}

function updateGeneratedCss(value: string) {
  generatedCss.value = value

  if (!selectedDraftId.value) return

  generatedRuleDrafts.value = generatedRuleDrafts.value.map((draft) => (
    draft.id === selectedDraftId.value ? { ...draft, css: value } : draft
  ))
}

async function toggleRuleDraft(id: string, enabled: boolean) {
  generatedRuleDrafts.value = generatedRuleDrafts.value.map((draft) => (
    draft.id === id ? { ...draft, enabled } : draft
  ))

  isBusy.value = true
  status.value = enabled ? '正在启用这条规则' : '正在停用这条规则'

  try {
    await applyEnabledDrafts()
    status.value = enabled ? '规则已启用' : '规则已停用'
  } catch (error) {
    status.value = error instanceof Error ? error.message : '更新规则失败'
  } finally {
    isBusy.value = false
  }
}

async function commitGeneratedCss() {
  if (!selectedDraftId.value) return

  isBusy.value = true
  status.value = '正在保存当前 CSS'

  try {
    await applyEnabledDrafts()
    status.value = '当前 CSS 已保存'
  } catch (error) {
    status.value = error instanceof Error ? error.message : '保存当前 CSS 失败'
  } finally {
    isBusy.value = false
  }
}

function getStatusPreview(message: string) {
  const normalized = message.replace(/\s+/g, ' ').trim()
  const maxLength = 72

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength)}...`
}

function formatAiDebugLog(debug: AiDebugLog) {
  return JSON.stringify({
    instruction: debug.instruction,
    model: debug.model,
    hasBaseUrl: debug.hasBaseUrl,
    summaryCount: debug.summaryCount,
    usedFallback: debug.usedFallback,
    retriedWithoutResponseFormat: debug.retriedWithoutResponseFormat,
    cssLength: debug.cssLength,
    explanation: debug.explanation,
    requestStartedAt: new Date(debug.requestStartedAt).toISOString(),
    responseFinishedAt: debug.responseFinishedAt ? new Date(debug.responseFinishedAt).toISOString() : undefined,
    requestError: debug.requestError,
    parseError: debug.parseError,
    rawResponse: debug.rawResponse,
  }, null, 2)
}

async function startElementPicker() {
  isBusy.value = true
  status.value = '请在网页中选择一个元素'

  try {
    await sendToActiveTab<StartElementPickerMessage>({
      type: 'CLEANWEB_START_ELEMENT_PICKER',
    })
    status.value = '选择模式已开启'
    window.setTimeout(() => window.close(), 120)
  } catch (error) {
    status.value = error instanceof Error ? error.message : '无法开启选择模式'
  } finally {
    isBusy.value = false
  }
}
</script>

<template>
  <main class="grid min-h-0 w-full max-w-full content-start gap-3 overflow-hidden p-4">
    <template v-if="!ready">
      <div class="flex h-8 items-center px-1">
        <span class="h-1.5 w-8 animate-pulse rounded-full bg-brand-tint"></span>
      </div>
    </template>

    <template v-else>
      <template v-if="mode === 'settings'">
        <SettingsPanel v-model:settings="llmSettings" :is-busy="isBusy" @save="saveSettings" @back="mode = 'clean'" />
      </template>

      <template v-else>
        <PopupHeader :current-site="currentSite" @open-settings="mode = 'settings'" />

        <ModeTabs v-model="mode" />

        <CleanModePanel v-if="mode === 'clean'" v-model:instruction="instruction" :generated-css="generatedCss"
          :ai-debug-text="selectedAiDebugText" :rule-drafts="generatedRuleDrafts" :selected-draft-id="selectedDraftId" :is-busy="isBusy"
          :has-api-key="hasApiKey" @update:instruction="instruction = $event" @update:generated-css="updateGeneratedCss"
          @select-rule-draft="selectRuleDraft" @toggle-rule-draft="toggleRuleDraft"
          @commit-generated-css="commitGeneratedCss" @analyze="collectDomSummary" @go-settings="mode = 'settings'" />
        <SelectModePanel v-else :is-busy="isBusy" :has-saved-rule="hasSavedRule" @start-picker="prepareElementPicker" />
      </template>

      <StatusBar :status="status" :is-busy="isBusy" @reset="resetPage" />
    </template>
  </main>
</template>
