<script setup lang="ts">
import { computed, ref } from 'vue'
import ChevronRightIcon from '../icons/ChevronRightIcon.vue'
import SendIcon from '../icons/SendIcon.vue'
import StopIcon from '../icons/StopIcon.vue'

const props = defineProps<{
  instruction: string
  generatedCss: string
  isBusy: boolean
  hasApiKey: boolean
}>()

const emit = defineEmits<{
  'update:instruction': [value: string]
  'update:generatedCss': [value: string]
  analyze: []
  'go-settings': []
}>()

const showCss = ref(false)

const hasText = computed(() => props.instruction.trim().length > 0)
const showStop = computed(() => props.isBusy && !hasText.value)
const canSend = computed(() => hasText.value && !props.isBusy)
const hasGeneratedCss = computed(() => props.generatedCss.trim().length > 0)
const sendLabel = computed(() => (hasGeneratedCss.value ? '重新生成并覆盖' : '发送'))

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

    <label class="grid gap-1.5">
      <span class="text-xs font-semibold text-ink-soft">净化指令</span>
      <div class="relative">
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

    <button type="button" class="flex items-center gap-1 text-left text-xs text-muted transition hover:text-ink-soft"
      @click="showCss = !showCss">
      <ChevronRightIcon class="h-3.5 w-3.5 transition-transform" :class="showCss ? 'rotate-90' : ''" />
      <span>{{ generatedCss ? "查看 / 编辑生成的 CSS" : "尚无生成结果" }}</span>
    </button>

    <p v-if="hasGeneratedCss" class="m-0 text-xs leading-relaxed text-muted">
      再次发送会覆盖当前预览，并用新规则更新页面。
    </p>

    <textarea v-if="showCss" :value="generatedCss" rows="7" wrap="soft" spellcheck="false"
      placeholder="/* 点击发送后将在此显示生成的 CSS */"
      class="block w-full max-w-full resize-y overflow-x-hidden whitespace-pre-wrap break-all rounded-lg border border-line bg-code p-3 font-mono text-xs leading-relaxed text-code-text outline-none transition focus:border-brand"
      @input="$emit('update:generatedCss', ($event.target as HTMLTextAreaElement).value)" />
  </div>
</template>
