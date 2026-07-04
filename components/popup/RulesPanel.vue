<script setup lang="ts">
import { computed, ref } from 'vue'
import ChevronRightIcon from '../icons/ChevronRightIcon.vue'
import type { GeneratedRuleDraft, GeneratedRuleSource } from '../../types/cleanweb'

const props = defineProps<{
  generatedCss: string
  aiDebugText: string
  ruleDrafts: GeneratedRuleDraft[]
  selectedDraftId: string | null
  isBusy: boolean
}>()

const emit = defineEmits<{
  'update:generatedCss': [value: string]
  selectRuleDraft: [id: string]
  toggleRuleDraft: [id: string, enabled: boolean]
  deleteRuleDraft: [id: string]
  commitGeneratedCss: []
}>()

const showCss = ref(true)
const showDebug = ref(false)

const enabledDraftCount = computed(() => props.ruleDrafts.filter((draft) => draft.enabled).length)
const selectedDraft = computed(() => props.ruleDrafts.find((draft) => draft.id === props.selectedDraftId) ?? null)
const selectedSourceLabel = computed(() => selectedDraft.value ? getSourceLabel(selectedDraft.value.source) : '规则')

function onDraftToggle(event: Event, draft: GeneratedRuleDraft) {
  emit('toggleRuleDraft', draft.id, (event.target as HTMLInputElement).checked)
}

function getSourceLabel(source: GeneratedRuleSource) {
  const sourceLabelMap: Record<GeneratedRuleSource, string> = {
    'full-page': '整页净化',
    'smart-hide': '智能隐藏',
    'ai-modify': 'AI 修改',
    'element-picker': '精准选择',
    fallback: '备用规则',
    legacy: '历史规则',
  }

  return sourceLabelMap[source]
}

function formatCreatedAt(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(timestamp)
}
</script>

<template>
  <div class="grid min-w-0 max-w-full gap-3 overflow-hidden">
    <section class="grid min-w-0 gap-2">
      <div class="flex min-w-0 items-center justify-between gap-2">
        <span class="text-xs font-semibold text-ink-soft">当前页面规则</span>
        <span class="shrink-0 text-[11px] text-muted">已启用 {{ enabledDraftCount }}/{{ ruleDrafts.length }}</span>
      </div>

      <div v-if="ruleDrafts.length === 0" class="rounded-lg border border-dashed border-line bg-white px-3 py-4 text-xs leading-relaxed text-muted">
        暂无规则。可以先在整页净化中生成，或进入精准选择处理页面元素。
      </div>

      <div v-else class="grid min-w-0 gap-1.5">
        <div
          v-for="draft in ruleDrafts"
          :key="draft.id"
          class="grid min-w-0 gap-2 rounded-lg border px-2.5 py-2 transition"
          :class="draft.id === selectedDraftId ? 'border-brand/50 bg-brand-tint' : 'border-line bg-white'"
        >
          <div class="flex min-w-0 items-center gap-2">
            <input
              :id="`cleanweb-rule-manager-${draft.id}`"
              type="checkbox"
              :checked="draft.enabled"
              :disabled="isBusy"
              class="h-3.5 w-3.5 shrink-0 accent-brand disabled:opacity-50"
              :aria-label="`启用 ${draft.instruction || '生成规则'}`"
              @change="onDraftToggle($event, draft)"
            />
            <button type="button" class="grid min-w-0 flex-1 gap-0.5 text-left" @click="emit('selectRuleDraft', draft.id)">
              <span class="flex min-w-0 items-center gap-1.5">
                <span class="shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                  {{ getSourceLabel(draft.source) }}
                </span>
                <span class="min-w-0 truncate text-xs font-medium text-ink">{{ draft.instruction || '未命名规则' }}</span>
              </span>
              <span class="truncate text-[11px] text-muted">{{ draft.explanation || '点击查看这条 CSS' }}</span>
            </button>
          </div>

          <div class="flex min-w-0 items-center justify-between gap-2 pl-5">
            <span class="text-[10px] text-muted">{{ formatCreatedAt(draft.createdAt) }}</span>
            <button
              type="button"
              :disabled="isBusy"
              class="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
              @click="emit('deleteRuleDraft', draft.id)"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </section>

    <button
      type="button"
      class="flex min-w-0 items-center gap-1 text-left text-xs text-muted transition hover:text-ink-soft"
      @click="showCss = !showCss"
    >
      <ChevronRightIcon class="h-3.5 w-3.5 transition-transform" :class="showCss ? 'rotate-90' : ''" />
      <span class="min-w-0 truncate">{{ generatedCss ? `查看 / 编辑 ${selectedSourceLabel} CSS` : '尚未选择规则' }}</span>
    </button>

    <div v-if="showCss" class="grid min-w-0 max-w-full overflow-hidden">
      <textarea
        :value="generatedCss"
        rows="8"
        wrap="soft"
        spellcheck="false"
        placeholder="/* 选择一条规则后将在此显示 CSS */"
        class="cleanweb-css-preview block min-w-0 max-w-full resize-y rounded-lg border border-line bg-code p-3 font-mono text-xs leading-relaxed text-code-text outline-none transition focus:border-brand"
        @input="$emit('update:generatedCss', ($event.target as HTMLTextAreaElement).value)"
        @change="$emit('commitGeneratedCss')"
      />
    </div>

    <button
      v-if="aiDebugText"
      type="button"
      class="flex min-w-0 items-center gap-1 rounded-lg border border-line bg-brand-tint px-2.5 py-2 text-left text-xs font-medium text-brand transition hover:border-brand/30"
      @click="showDebug = !showDebug"
    >
      <ChevronRightIcon class="h-3.5 w-3.5 transition-transform" :class="showDebug ? 'rotate-90' : ''" />
      <span class="min-w-0 truncate">AI 调试信息 / 原始返回</span>
    </button>

    <div v-if="showDebug && aiDebugText" class="grid min-w-0 max-w-full overflow-hidden">
      <textarea
        :value="aiDebugText"
        rows="8"
        readonly
        wrap="soft"
        spellcheck="false"
        class="cleanweb-css-preview block min-w-0 max-w-full resize-y rounded-lg border border-line bg-code p-3 font-mono text-[11px] leading-relaxed text-code-text outline-none"
      />
    </div>
  </div>
</template>
