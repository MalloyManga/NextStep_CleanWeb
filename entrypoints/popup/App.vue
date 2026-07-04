<script setup lang="ts">
import { computed, ref } from 'vue';
import { browser } from 'wxt/browser';
import type {
  ApplyRuleMessage,
  CleanWebResponse,
  DomSummaryMessage,
  ResetRuleMessage,
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
const isBusy = ref(false);
const summaryCount = ref(0);

const canApply = computed(() => generatedCss.value.trim().length > 0);

async function getActiveTabId() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('没有找到当前标签页');
  }
  return tab.id;
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
</script>

<template>
  <main class="grid gap-3.5 p-4.5 text-ink">
    <header class="flex items-center justify-between">
      <div>
        <p class="mb-0.5 text-xs font-bold uppercase text-brand">CleanWeb</p>
        <h1 class="m-0 text-[22px] font-bold leading-tight">网页净化器</h1>
      </div>
      <span class="size-3 rounded-full bg-[#45a36d] shadow-[0_0_0_6px_rgb(69_163_109/14%)]" aria-hidden="true" />
    </header>

    <label class="grid gap-1.5 text-[13px] font-bold">
      <span>你的指令</span>
      <textarea
        v-model="instruction"
        rows="3"
        class="w-full resize-y rounded-lg border border-line bg-surface p-2.5 leading-normal text-ink outline-none focus:border-brand focus:shadow-[0_0_0_3px_var(--color-brand-soft)]"
      />
    </label>

    <label class="grid gap-1.5 text-[13px] font-bold">
      <span>当前测试 CSS</span>
      <textarea
        v-model="generatedCss"
        rows="10"
        class="w-full resize-y rounded-lg border border-line bg-surface p-2.5 font-mono text-xs leading-normal text-ink outline-none focus:border-brand focus:shadow-[0_0_0_3px_var(--color-brand-soft)]"
      />
    </label>

    <div class="grid grid-cols-[1fr_1.25fr_0.85fr] gap-2">
      <button
        type="button"
        :disabled="isBusy"
        class="min-h-9.5 cursor-pointer rounded-lg border border-line bg-surface px-2 font-bold text-ink disabled:cursor-not-allowed disabled:opacity-60"
        @click="collectDomSummary"
      >
        读取页面
      </button>
      <button
        type="button"
        :disabled="isBusy || !canApply"
        class="min-h-9.5 cursor-pointer rounded-lg border border-brand bg-brand px-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        @click="applyCss"
      >
        应用并保存
      </button>
      <button
        type="button"
        :disabled="isBusy"
        class="min-h-9.5 cursor-pointer rounded-lg border border-line bg-surface px-2 font-bold text-danger disabled:cursor-not-allowed disabled:opacity-60"
        @click="resetPage"
      >
        恢复
      </button>
    </div>

    <p class="m-0 min-h-4.5 text-xs text-muted">{{ status }}</p>
  </main>
</template>
