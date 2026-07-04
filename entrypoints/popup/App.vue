<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { browser } from 'wxt/browser';
import type {
  ApplyRuleMessage,
  CleanWebResponse,
  DomSummaryMessage,
  ResetRuleMessage,
} from '../../types/cleanweb';

type WorkMode = 'clean' | 'select';

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
  status.value = '精准选择逻辑待接入';
}
</script>

<template>
  <main class="min-h-[560px] bg-paper text-ink">
    <section class="border-b border-line/80 bg-surface px-5 pb-4 pt-5">
      <header class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-brand">CleanWeb</p>
          <h1 class="m-0 text-2xl font-black leading-tight">网页净化器</h1>
        </div>
        <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-brand/20 bg-brand-soft text-lg font-black text-brand">
          C
        </div>
      </header>

      <div class="mt-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5">
        <div class="min-w-0">
          <p class="m-0 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Current Site</p>
          <p class="m-0 truncate text-sm font-bold">{{ currentSite }}</p>
        </div>
        <span class="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-bold text-muted">
          {{ summaryLabel }}
        </span>
      </div>
    </section>

    <section class="grid gap-4 p-5">
      <div class="grid grid-cols-2 rounded-xl border border-line bg-surface p-1">
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm font-black transition"
          :class="mode === 'clean' ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink'"
          @click="mode = 'clean'"
        >
          整页净化
        </button>
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-sm font-black transition"
          :class="mode === 'select' ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink'"
          @click="mode = 'select'"
        >
          精准选择
        </button>
      </div>

      <div v-if="mode === 'clean'" class="grid gap-4">
        <label class="grid gap-2">
          <span class="text-sm font-black">自然语言指令</span>
          <textarea
            v-model="instruction"
            rows="3"
            class="w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm leading-6 text-ink outline-none transition focus:border-brand focus:shadow-[0_0_0_3px_var(--color-brand-soft)]"
          />
        </label>

        <label class="grid gap-2">
          <span class="flex items-center justify-between gap-3 text-sm font-black">
            <span>规则预览</span>
            <span class="text-xs font-bold text-muted">测试 CSS</span>
          </span>
          <textarea
            v-model="generatedCss"
            rows="9"
            class="w-full resize-y rounded-xl border border-line bg-[#101817] p-3 font-mono text-xs leading-5 text-[#dff7ec] outline-none transition focus:border-brand focus:shadow-[0_0_0_3px_var(--color-brand-soft)]"
          />
        </label>

        <div class="grid grid-cols-[1fr_1.25fr] gap-2">
          <button
            type="button"
            :disabled="isBusy"
            class="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm font-black text-ink transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-60"
            @click="collectDomSummary"
          >
            读取页面
          </button>
          <button
            type="button"
            :disabled="isBusy || !canApply"
            class="min-h-11 rounded-xl border border-brand bg-brand px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#255c52] disabled:cursor-not-allowed disabled:opacity-60"
            @click="applyCss"
          >
            应用并保存
          </button>
        </div>
      </div>

      <div v-else class="grid gap-4">
        <div class="rounded-xl border border-line bg-surface p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="m-0 text-sm font-black">目标元素</p>
              <p class="m-0 mt-1 text-xs font-bold text-muted">尚未选择</p>
            </div>
            <span class="rounded-full bg-paper px-2.5 py-1 text-xs font-black text-brand">Inspect</span>
          </div>
        </div>

        <button
          type="button"
          class="min-h-12 rounded-xl border border-brand bg-brand px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#255c52]"
          @click="prepareElementPicker"
        >
          选择网页元素
        </button>

        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled
            class="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm font-black text-muted opacity-60"
          >
            隐藏
          </button>
          <button
            type="button"
            disabled
            class="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm font-black text-muted opacity-60"
          >
            AI 修改
          </button>
        </div>
      </div>

      <div class="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
        <p class="m-0 min-w-0 truncate text-xs font-bold text-muted">{{ status }}</p>
        <button
          type="button"
          :disabled="isBusy"
          class="rounded-lg px-3 py-1.5 text-xs font-black text-danger transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
          @click="resetPage"
        >
          恢复
        </button>
      </div>
    </section>
  </main>
</template>
