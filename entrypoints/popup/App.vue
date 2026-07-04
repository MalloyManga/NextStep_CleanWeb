<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { browser } from 'wxt/browser';
import { storage } from 'wxt/utils/storage';
import CleanModePanel from '../../components/popup/CleanModePanel.vue';
import ModeTabs from '../../components/popup/ModeTabs.vue';
import PopupHeader from '../../components/popup/PopupHeader.vue';
import SelectModePanel from '../../components/popup/SelectModePanel.vue';
import StatusBar from '../../components/popup/StatusBar.vue';
import type { WorkMode } from '../../components/popup/types';
import type {
  ApplyRuleMessage,
  CleanWebResponse,
  DomSummaryMessage,
  ResetRuleMessage,
  StartElementPickerMessage,
} from '../../types/cleanweb';
import { FALLBACK_CSS, generateCssRule } from '../../utils/llm';

const MODE_STORAGE_KEY = 'local:cleanweb:popup-mode';

const instruction = ref('隐藏侧栏和广告，把正文区域居中放大');
const generatedCss = ref(FALLBACK_CSS);
const status = ref('准备净化当前页面');
const currentSite = ref('当前页面');
const isBusy = ref(false);
const summaryCount = ref(0);
const mode = ref<WorkMode>('clean');

const canApply = computed(() => generatedCss.value.trim().length > 0);
const summaryLabel = computed(() => (summaryCount.value > 0 ? `${summaryCount.value} 元素` : ''));

onMounted(async () => {
  currentSite.value = await getCurrentSiteLabel();
  mode.value = await getSavedMode();
});

watch(mode, (nextMode) => {
  storage.setItem(MODE_STORAGE_KEY, nextMode);
});

async function getActiveTabId() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('没有找到当前标签页');
  }
  return tab.id;
}

async function getCurrentSiteLabel() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return getHostnameLabel(tab?.url);
}

function getHostnameLabel(url: string | undefined) {
  if (!url) return '当前页面';

  try {
    return new URL(url).hostname;
  } catch {
    return '当前页面';
  }
}

async function getSavedMode() {
  const savedMode = await storage.getItem<WorkMode>(MODE_STORAGE_KEY);
  return isWorkMode(savedMode) ? savedMode : 'clean';
}

function isWorkMode(value: unknown): value is WorkMode {
  return value === 'clean' || value === 'select';
}

async function sendToActiveTab<TMessage, TResponse = CleanWebResponse>(message: TMessage) {
  const tabId = await getActiveTabId();
  return browser.tabs.sendMessage(tabId, message) as Promise<TResponse>;
}

async function collectDomSummary() {
  isBusy.value = true;
  status.value = '正在读取页面结构';

  try {
    const response = await sendToActiveTab<DomSummaryMessage, CleanWebResponse>({
      type: 'CLEANWEB_COLLECT_DOM_SUMMARY',
    });

    summaryCount.value = response.summaryCount ?? 0;
    status.value = `已读取 ${summaryCount.value} 个元素，正在生成规则`;

    const result = await generateCssRule({
      instruction: instruction.value,
      domSummary: response.summary ?? [],
    });
    generatedCss.value = result.css || FALLBACK_CSS;
    status.value = result.explanation;
  } catch (error) {
    status.value = error instanceof Error ? error.message : '读取页面结构失败';
  } finally {
    isBusy.value = false;
  }
}

async function applyCss() {
  if (!canApply.value) return;

  isBusy.value = true;
  status.value = '正在应用净化规则';

  try {
    await sendToActiveTab<ApplyRuleMessage>({
      type: 'CLEANWEB_APPLY_RULE',
      css: generatedCss.value,
      instruction: instruction.value,
      save: true,
    });
    status.value = '规则已应用并保存';
  } catch (error) {
    status.value = error instanceof Error ? error.message : '应用规则失败';
  } finally {
    isBusy.value = false;
  }
}

async function resetPage() {
  isBusy.value = true;
  status.value = '正在恢复页面';

  try {
    await sendToActiveTab<ResetRuleMessage>({
      type: 'CLEANWEB_RESET_RULE',
    });
    status.value = '页面已恢复';
  } catch (error) {
    status.value = error instanceof Error ? error.message : '恢复页面失败';
  } finally {
    isBusy.value = false;
  }
}

function prepareElementPicker() {
  mode.value = 'select';
  startElementPicker();
}

async function startElementPicker() {
  isBusy.value = true;
  status.value = '请在网页中选择一个元素';

  try {
    await sendToActiveTab<StartElementPickerMessage>({
      type: 'CLEANWEB_START_ELEMENT_PICKER',
    });
    status.value = '选择模式已开启';
    window.setTimeout(() => window.close(), 120);
  } catch (error) {
    status.value = error instanceof Error ? error.message : '无法开启选择模式';
  } finally {
    isBusy.value = false;
  }
}
</script>

<template>
  <main class="grid min-h-0 content-start gap-3 p-4">
    <PopupHeader :current-site="currentSite" :summary-label="summaryLabel" />

    <ModeTabs v-model="mode" />

    <CleanModePanel
      v-if="mode === 'clean'"
      v-model:instruction="instruction"
      v-model:generated-css="generatedCss"
      :is-busy="isBusy"
      :can-apply="canApply"
      @analyze="collectDomSummary"
      @apply="applyCss"
    />
    <SelectModePanel v-else :is-busy="isBusy" @start-picker="prepareElementPicker" />

    <StatusBar :status="status" :is-busy="isBusy" @reset="resetPage" />
  </main>
</template>
