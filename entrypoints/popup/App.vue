<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
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
  CleanWebResponse,
  DomSummaryMessage,
  LlmSettings,
  ResetRuleMessage,
  StartElementPickerMessage,
} from '../../types/cleanweb'
import { FALLBACK_CSS, generateCssRule } from '../../utils/llm'
import { getLlmSettings, getRule, saveLlmSettings } from '../../utils/storage'

const MODE_STORAGE_KEY = 'local:cleanweb:popup-mode'

const instruction = ref('隐藏侧栏和广告，把正文区域居中放大')
const generatedCss = ref('')
const status = ref('准备净化当前页面')
const currentSite = ref('当前页面')
const isBusy = ref(false)
const summaryCount = ref(0)
const mode = ref<WorkMode>('clean')
const ready = ref(false)
const hasGenerated = ref(false)
const hasSavedRule = ref(false)
const llmSettings = ref<LlmSettings>({
  apiKey: '',
  baseUrl: '',
  model: 'gpt-4o-mini',
})

const hasApiKey = computed(() => llmSettings.value.apiKey.trim().length > 0)

onMounted(async () => {
  currentSite.value = await getCurrentSiteLabel()
  mode.value = await getSavedMode()
  llmSettings.value = await getSavedLlmSettings()
  hasSavedRule.value = await checkSavedRule()
  ready.value = true
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

async function checkSavedRule() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.url) return false
    const hostname = new URL(tab.url).hostname
    if (!hostname) return false
    const rule = await getRule(hostname)
    return Boolean(rule?.css)
  } catch {
    return false
  }
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

async function collectDomSummary() {
  isBusy.value = true
  status.value = '正在读取页面结构'

  try {
    const response = await sendToActiveTab<DomSummaryMessage, CleanWebResponse>({
      type: 'CLEANWEB_COLLECT_DOM_SUMMARY',
    })

    summaryCount.value = response.summaryCount ?? 0
    status.value = `已读取 ${summaryCount.value} 个元素，正在生成规则`

    const result = await generateCssRule({
      instruction: instruction.value,
      domSummary: response.summary ?? [],
      settings: llmSettings.value,
    })
    generatedCss.value = result.css || FALLBACK_CSS
    hasGenerated.value = true

    // P0-1：生成后自动应用 + 保存，一步到位
    status.value = '正在应用净化规则'
    await sendToActiveTab<ApplyRuleMessage>({
      type: 'CLEANWEB_APPLY_RULE',
      css: generatedCss.value,
      instruction: instruction.value,
      save: true,
    })
    hasSavedRule.value = true
    status.value = result.explanation || '规则已应用并保存'
  } catch (error) {
    status.value = error instanceof Error ? error.message : '读取页面结构失败'
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
  <main class="grid min-h-0 content-start gap-3 p-4">
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

        <CleanModePanel v-if="mode === 'clean'" v-model:instruction="instruction" v-model:generated-css="generatedCss"
          :is-busy="isBusy" :has-api-key="hasApiKey" @analyze="collectDomSummary" @go-settings="mode = 'settings'" />
        <SelectModePanel v-else :is-busy="isBusy" :has-saved-rule="hasSavedRule" @start-picker="prepareElementPicker" />
      </template>

      <StatusBar :status="status" :is-busy="isBusy" @reset="resetPage" />
    </template>
  </main>
</template>
