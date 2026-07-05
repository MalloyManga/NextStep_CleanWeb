<script setup lang="ts">
import { computed } from 'vue'
import SendIcon from '../icons/SendIcon.vue'
import StopIcon from '../icons/StopIcon.vue'

const props = defineProps<{
  instruction: string
  isBusy: boolean
  hasApiKey: boolean
}>()

const emit = defineEmits<{
  'update:instruction': [value: string]
  analyze: []
  cancel: []
  'go-settings': []
}>()

const hasText = computed(() => props.instruction.trim().length > 0)
const showStop = computed(() => props.isBusy)
const canSend = computed(() => hasText.value && !props.isBusy)
const sendLabel = computed(() => '发送')

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

function onSendButtonClick() {
  if (showStop.value) {
    emit('cancel')
    return
  }

  if (canSend.value) {
    emit('analyze')
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
        <button type="button" :disabled="!canSend && !showStop"
          class="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full transition"
          :class="canSend || showStop ? 'bg-brand text-white hover:bg-brand-dark' : 'cursor-not-allowed bg-brand-tint text-muted'"
          :title="showStop ? '停止生成' : (canSend ? sendLabel : '输入指令后发送')" :aria-label="showStop ? '停止生成' : sendLabel"
          @click="onSendButtonClick">
          <StopIcon v-if="showStop" class="h-3 w-3" />
          <SendIcon v-else class="h-4 w-4" />
        </button>
      </div>
    </label>

  </div>
</template>
