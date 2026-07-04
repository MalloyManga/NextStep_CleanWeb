<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
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

const instruction = ref('隐藏侧边栏和广告，把正文区域居中放大');
const generatedCss = ref(`aside,
[class*="sidebar"],
[class*="ad"],
[class*="recommend"] {
  display: none !important;
}

main,
article {
  max-width: 860px !important;
  margin-left: auto !important;
  margin-right: auto !important;
  font-size: 18px !important;
  line-height: 1.8 !important;
}`);
const status = ref('准备净化当前页面');
const currentSite = ref('当前页面');
const isBusy = ref(false);
const summaryCount = ref(0);
const mode = ref<WorkMode>('clean');

const canApply = computed(() => generatedCss.value.trim().length > 0);
const summaryLabel = computed(() => (summaryCount.value > 0 ? `${summaryCount.value} 个元素` : '未读取'));

onMounted(async () => {
  currentSite.value = await getCurrentSiteLabel();
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
    status.value = `已读取 ${summaryCount.value} 个可见元素`;
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
  } catch (error) {
    status.value = error instanceof Error ? error.message : '无法开启选择模式';
  } finally {
    isBusy.value = false;
  }
}
</script>

<template>
  <main class="min-h-140 bg-paper text-ink">
    <PopupHeader :current-site="currentSite" :summary-label="summaryLabel" />

    <section class="grid gap-4 p-5">
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
    </section>
  </main>
</template>
