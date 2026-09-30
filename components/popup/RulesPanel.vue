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
  <div class="grid min-w-0 max-w-full gap-4 overflow-hidden">
    <section class="grid min-w-0 gap-2.5">
      <div class="flex min-w-0 items-baseline justify-between gap-2">
        <span class="cw-section-title">当前页面规则</span>
        <span v-if="ruleDrafts.length" class="cw-footnote shrink-0">已启用 {{ enabledDraftCount }}/{{ ruleDrafts.length }}</span>
      </div>

      <div v-if="ruleDrafts.length === 0" class="cw-elevated-inset px-4 py-6 text-center">
        <p class="cw-footnote m-0">暂无规则。可以先在整页净化中生成，或进入精准选择处理页面元素。</p>
      </div>

      <div v-else class="cw-elevated-inset grid min-w-0 overflow-hidden">
        <div
          v-for="draft in ruleDrafts"
          :key="draft.id"
          class="cw-row grid min-w-0 gap-2 px-3 py-3 transition-colors duration-[260ms]"
          :class="draft.id === selectedDraftId ? 'bg-brand-tint' : ''"
        >
          <div class="flex min-w-0 items-center gap-3">
            <button
              type="button"
              role="switch"
              :aria-checked="draft.enabled"
              :aria-label="`启用 ${draft.instruction || '生成规则'}`"
              :disabled="isBusy"
              class="cw-switch"
              :data-state="draft.enabled ? 'on' : 'off'"
              @click="emit('toggleRuleDraft', draft.id, !draft.enabled)"
            />
            <button type="button" class="grid min-w-0 flex-1 gap-1 text-left" @click="emit('selectRuleDraft', draft.id)">
              <span class="flex min-w-0 items-center gap-2">
                <span class="shrink-0 rounded-full bg-brand/12 px-2 py-[3px] text-[10px] font-semibold tracking-[0.01em] text-brand">
                  {{ getSourceLabel(draft.source) }}
                </span>
                <span class="min-w-0 truncate text-[13px] font-medium text-ink">{{ draft.instruction || '未命名规则' }}</span>
              </span>
              <span class="cw-footnote truncate">{{ draft.explanation || '点击查看这条 CSS' }}</span>
            </button>
          </div>

          <div class="flex min-w-0 items-center justify-between gap-2 pl-[50px]">
            <span class="cw-footnote">{{ formatCreatedAt(draft.createdAt) }}</span>
            <button
              type="button"
              :disabled="isBusy"
              class="cw-press shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-danger hover:bg-danger-tint disabled:cursor-not-allowed disabled:opacity-40"
              @click="emit('deleteRuleDraft', draft.id)"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="grid min-w-0 gap-2.5">
      <button
        type="button"
        class="flex min-w-0 items-center gap-2 text-left"
        @click="showCss = !showCss"
      >
        <ChevronRightIcon class="cw-chevron h-3.5 w-3.5 shrink-0 text-muted" :data-open="showCss ? 'true' : 'false'" />
        <span class="cw-body min-w-0 truncate font-medium text-ink-soft">{{ generatedCss ? `查看 / 编辑 ${selectedSourceLabel} CSS` : '尚未选择规则' }}</span>
      </button>

      <div class="cw-disclosure" :data-open="showCss ? 'true' : 'false'">
        <div class="grid min-w-0 max-w-full overflow-hidden">
          <textarea
            :value="generatedCss"
            rows="8"
            wrap="soft"
            spellcheck="false"
            placeholder="/* 选择一条规则后将在此显示 CSS */"
            class="cleanweb-css-preview block min-w-0 max-w-full resize-y rounded-[10px] border border-line bg-code p-3 font-mono text-xs leading-relaxed text-code-text outline-none"
            @input="$emit('update:generatedCss', ($event.target as HTMLTextAreaElement).value)"
            @change="$emit('commitGeneratedCss')"
          />
        </div>
      </div>
    </section>

    <section v-if="aiDebugText" class="grid min-w-0 gap-2.5">
      <button
        type="button"
        class="flex min-w-0 items-center gap-2 text-left"
        @click="showDebug = !showDebug"
      >
        <ChevronRightIcon class="cw-chevron h-3.5 w-3.5 shrink-0 text-muted" :data-open="showDebug ? 'true' : 'false'" />
        <span class="cw-body min-w-0 truncate font-medium text-ink-soft">AI 调试信息 / 原始返回</span>
      </button>

      <div class="cw-disclosure" :data-open="showDebug ? 'true' : 'false'">
        <div class="grid min-w-0 max-w-full overflow-hidden">
          <textarea
            :value="aiDebugText"
            rows="8"
            readonly
            wrap="soft"
            spellcheck="false"
            class="cleanweb-css-preview block min-w-0 max-w-full resize-y rounded-[10px] border border-line bg-code p-3 font-mono text-[11px] leading-relaxed text-code-text outline-none"
          />
        </div>
      </div>
    </section>
  </div>
</template>
