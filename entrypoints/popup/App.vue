<script setup lang="ts">
import { computed, ref } from 'vue';
import { browser } from 'wxt/browser';
import type { ApplyRuleMessage, CleanWebResponse, DomSummaryMessage, ResetRuleMessage } from '../../types/cleanweb';

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

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    throw new Error('没有找到当前标签页');
  }
  return tab;
}

async function sendToActiveTab<TMessage, TResponse = CleanWebResponse>(message: TMessage) {
  const tab = await getActiveTab();
  return browser.tabs.sendMessage(tab.id!, message) as Promise<TResponse>;
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
  <main class="popup-shell">
    <header class="header">
      <div>
        <p class="eyebrow">CleanWeb</p>
        <h1>网页净化器</h1>
      </div>
      <span class="status-dot" aria-hidden="true" />
    </header>

    <label class="field">
      <span>你的指令</span>
      <textarea v-model="instruction" rows="3" />
    </label>

    <label class="field">
      <span>当前测试 CSS</span>
      <textarea v-model="generatedCss" class="code-field" rows="10" />
    </label>

    <div class="actions">
      <button type="button" :disabled="isBusy" @click="collectDomSummary">读取页面</button>
      <button type="button" :disabled="isBusy || !canApply" class="primary" @click="applyCss">应用并保存</button>
      <button type="button" :disabled="isBusy" class="ghost" @click="resetPage">恢复</button>
    </div>

    <p class="status">{{ status }}</p>
  </main>
</template>
