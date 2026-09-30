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
  <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
    <!-- P0-2：未配置 AI Key 提示 -->
    <div v-if="!hasApiKey"
      class="cw-elevated flex items-center justify-between gap-2.5 px-3 py-2.5">
      <span class="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-warn"></span>
      <span class="cw-body min-w-0 flex-1 text-ink-soft">未配置 AI Key，无法使用 AI 净化（点选隐藏仍可离线使用）</span>
      <button type="button"
        class="cw-press shrink-0 rounded-full bg-track px-3 py-1.5 text-xs font-semibold text-brand"
        @click="$emit('go-settings')">
        去设置
      </button>
    </div>

    <label class="flex min-h-0 flex-1 flex-col gap-2">
      <span class="cw-section-title">净化指令</span>
      <div class="cw-field relative flex min-h-0 flex-1 flex-col">
        <textarea :value="instruction" rows="3"
          class="block min-h-0 w-full flex-1 resize-none bg-transparent px-3 py-2.5 pb-10 text-[13px] leading-relaxed text-ink outline-none placeholder:text-muted"
          placeholder="例如：隐藏右侧推荐栏，把正文居中放大" @input="onInstructionInput" @keydown="onKeydown" />
        <button type="button" :disabled="!canSend && !showStop"
          class="cw-press absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full"
          :class="canSend || showStop ? 'bg-brand text-white' : 'bg-track text-muted cursor-not-allowed'"
          :title="showStop ? '停止生成' : (canSend ? sendLabel : '输入指令后发送')" :aria-label="showStop ? '停止生成' : sendLabel"
          @click="onSendButtonClick">
          <StopIcon v-if="showStop" class="h-3.5 w-3.5" />
          <SendIcon v-else class="h-4 w-4" />
        </button>
      </div>
      <span class="cw-footnote">Enter 发送 · Shift+Enter 换行</span>
    </label>

  </div>
</template>
