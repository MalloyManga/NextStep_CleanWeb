<script setup lang="ts">
import { computed, ref } from 'vue'
import ChevronRightIcon from '../icons/ChevronRightIcon.vue'
import SendIcon from '../icons/SendIcon.vue'
import StopIcon from '../icons/StopIcon.vue'

const props = defineProps<{
  instruction: string
  generatedCss: string
  isBusy: boolean
  canApply: boolean
}>()

const emit = defineEmits<{
  'update:instruction': [value: string]
  'update:generatedCss': [value: string]
  analyze: []
  apply: []
}>()

const showCss = ref(false)

const hasText = computed(() => props.instruction.trim().length > 0)
const showStop = computed(() => props.isBusy && !hasText.value)
const canSend = computed(() => hasText.value && !props.isBusy)

function onInstructionInput(event: Event) {
  emit('update:instruction', (event.target as HTMLTextAreaElement).value)
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
  <div class="grid gap-3">
    <label class="grid gap-1.5">
      <span class="text-xs font-semibold text-ink-soft">净化指令</span>
      <div class="relative">
        <textarea :value="instruction" rows="3"
          class="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 pb-9 text-sm leading-relaxed text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
          placeholder="例如：隐藏右侧推荐栏，把正文居中放大" @input="onInstructionInput" @keydown="onKeydown" />
        <button type="button" :disabled="!canSend"
          class="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full transition"
          :class="canSend || showStop ? 'bg-brand text-white hover:bg-brand-dark' : 'cursor-not-allowed bg-brand-tint text-muted'"
          :title="showStop ? '生成中' : (canSend ? '发送' : '输入指令后发送')" :aria-label="showStop ? '生成中' : '发送'"
          @click="canSend ? emit('analyze') : undefined">
          <StopIcon v-if="showStop" class="h-3 w-3" />
          <SendIcon v-else class="h-4 w-4" />
        </button>
      </div>
    </label>

    <button v-if="canApply" type="button" :disabled="isBusy"
      class="flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink-soft transition hover:border-brand/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      @click="$emit('apply')">
      应用并保存
    </button>

    <button type="button" class="flex items-center gap-1 text-left text-xs text-muted transition hover:text-ink-soft"
      @click="showCss = !showCss">
      <ChevronRightIcon class="h-3.5 w-3.5 transition-transform" :class="showCss ? 'rotate-90' : ''" />
      <span>查看生成的 CSS</span>
    </button>

    <textarea v-if="showCss" :value="generatedCss" rows="7"
      class="w-full resize-y rounded-lg border border-line bg-code p-3 font-mono text-xs leading-relaxed text-code-text outline-none transition focus:border-brand"
      @input="$emit('update:generatedCss', ($event.target as HTMLTextAreaElement).value)" />
  </div>
</template>
