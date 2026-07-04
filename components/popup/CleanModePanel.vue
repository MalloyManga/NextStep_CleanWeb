<script setup lang="ts">
import { computed, ref } from 'vue'
import ChevronRightIcon from '../icons/ChevronRightIcon.vue'
import SendIcon from '../icons/SendIcon.vue'
import StopIcon from '../icons/StopIcon.vue'
import type { GeneratedRuleDraft } from '../../types/cleanweb'

const props = defineProps<{
  instruction: string
  generatedCss: string
  ruleDrafts: GeneratedRuleDraft[]
  selectedDraftId: string | null
  isBusy: boolean
  hasApiKey: boolean
}>()

const emit = defineEmits<{
  'update:instruction': [value: string]
  'update:generatedCss': [value: string]
  selectRuleDraft: [id: string]
  toggleRuleDraft: [id: string, enabled: boolean]
  analyze: []
  'go-settings': []
}>()

const showCss = ref(false)

const hasText = computed(() => props.instruction.trim().length > 0)
const showStop = computed(() => props.isBusy && !hasText.value)
const canSend = computed(() => hasText.value && !props.isBusy)
const hasGeneratedCss = computed(() => props.generatedCss.trim().length > 0)
const sendLabel = computed(() => (hasGeneratedCss.value ? '重新生成' : '发送'))
const enabledDraftCount = computed(() => props.ruleDrafts.filter((draft) => draft.enabled).length)

function onInstructionInput(event: Event) {
  emit('update:instruction', (event.target as HTMLTextAreaElement).value)
}

function onDraftToggle(event: Event, draft: GeneratedRuleDraft) {
  emit('toggleRuleDraft', draft.id, (event.target as HTMLInputElement).checked)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    if (canSend.value) {
      emit('analyze')
    }
  }
}
</script>

<template>
  <div class="grid min-w-0 max-w-full gap-3 overflow-hidden">
    <!-- P0-2：未配置 AI Key 提示 -->
    <div v-if="!hasApiKey"
      class="flex items-center justify-between gap-2 rounded-lg border border-brand/25 bg-brand-tint px-3 py-2">
      <span class="min-w-0 text-xs text-ink-soft">未配置 AI Key，将使用通用规则</span>
      <button type="button"
        class="shrink-0 rounded-md bg-brand px-2 py-1 text-xs font-medium text-white transition hover:bg-brand-dark"
        @click="$emit('go-settings')">
        去设置
      </button>
    </div>

    <label class="grid min-w-0 gap-1.5">
      <span class="text-xs font-semibold text-ink-soft">净化指令</span>
      <div class="relative min-w-0">
        <textarea :value="instruction" rows="3"
          class="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 pb-9 text-sm leading-relaxed text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
          placeholder="例如：隐藏右侧推荐栏，把正文居中放大" @input="onInstructionInput" @keydown="onKeydown" />
        <button type="button" :disabled="!canSend"
          class="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full transition"
          :class="canSend || showStop ? 'bg-brand text-white hover:bg-brand-dark' : 'cursor-not-allowed bg-brand-tint text-muted'"
          :title="showStop ? '生成中' : (canSend ? sendLabel : '输入指令后发送')" :aria-label="showStop ? '生成中' : sendLabel"
          @click="canSend ? emit('analyze') : undefined">
          <StopIcon v-if="showStop" class="h-3 w-3" />
          <SendIcon v-else class="h-4 w-4" />
        </button>
      </div>
    </label>

    <button type="button" class="flex min-w-0 items-center gap-1 text-left text-xs text-muted transition hover:text-ink-soft"
      @click="showCss = !showCss">
      <ChevronRightIcon class="h-3.5 w-3.5 transition-transform" :class="showCss ? 'rotate-90' : ''" />
      <span class="min-w-0 truncate">{{ generatedCss ? "查看 / 编辑生成的 CSS" : "尚无生成结果" }}</span>
    </button>

    <section v-if="ruleDrafts.length > 0" class="grid min-w-0 gap-2">
      <div class="flex min-w-0 items-center justify-between gap-2">
        <span class="text-xs font-semibold text-ink-soft">生成记录</span>
        <span class="shrink-0 text-[11px] text-muted">已启用 {{ enabledDraftCount }}/{{ ruleDrafts.length }}</span>
      </div>

      <div class="grid min-w-0 gap-1.5">
        <div v-for="draft in ruleDrafts" :key="draft.id"
          class="flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 transition"
          :class="draft.id === selectedDraftId ? 'border-brand/50 bg-brand-tint' : 'border-line bg-white'">
          <input :id="`cleanweb-rule-${draft.id}`" type="checkbox" :checked="draft.enabled"
            class="h-3.5 w-3.5 shrink-0 accent-brand" :aria-label="`启用 ${draft.instruction || '生成规则'}`"
            @change="onDraftToggle($event, draft)" />
          <button type="button" class="grid min-w-0 flex-1 gap-0.5 text-left" @click="emit('selectRuleDraft', draft.id)">
            <span class="truncate text-xs font-medium text-ink">{{ draft.instruction || '未命名规则' }}</span>
            <span class="truncate text-[11px] text-muted">{{ draft.explanation || '点击查看这条 CSS' }}</span>
          </button>
        </div>
      </div>
    </section>

    <div v-if="showCss" class="grid min-w-0 max-w-full overflow-hidden">
      <textarea :value="generatedCss" rows="7" wrap="soft" spellcheck="false"
        placeholder="/* 点击发送后将在此显示生成的 CSS */"
        class="cleanweb-css-preview block min-w-0 max-w-full resize-y rounded-lg border border-line bg-code p-3 font-mono text-xs leading-relaxed text-code-text outline-none transition focus:border-brand"
        @input="$emit('update:generatedCss', ($event.target as HTMLTextAreaElement).value)" />
    </div>
  </div>
</template>
