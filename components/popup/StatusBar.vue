<script setup lang="ts">
import { ref } from 'vue'
import SpinnerIcon from '../icons/SpinnerIcon.vue'

defineProps<{
  status: string
  isBusy: boolean
}>()

defineEmits<{
  reset: []
}>()

const confirming = ref(false)

function confirmReset() {
  confirming.value = false
}
</script>

<template>
  <div class="pt-1">
    <!-- 确认态：展开二次确认 -->
    <div v-if="confirming" class="flex items-center justify-between gap-2 rounded-lg border border-danger/30 bg-danger-soft px-2.5 py-1.5">
      <span class="min-w-0 truncate text-xs text-danger">确定移除本页所有规则？</span>
      <div class="flex shrink-0 gap-1.5">
        <button type="button"
          class="rounded-md bg-danger px-2 py-1 text-xs font-medium text-white transition hover:opacity-90"
          @click="$emit('reset'); confirmReset()">
          确定
        </button>
        <button type="button"
          class="rounded-md px-2 py-1 text-xs text-muted transition hover:text-ink"
          @click="confirming = false">
          取消
        </button>
      </div>
    </div>

    <!-- 默认态：状态 + 恢复入口 -->
    <div v-else class="flex items-center justify-between gap-3">
      <p class="m-0 flex min-w-0 items-center gap-1.5 truncate text-xs text-ink-soft">
        <SpinnerIcon v-if="isBusy" class="h-3.5 w-3.5 shrink-0 text-brand" />
        <span v-else class="h-1.5 w-1.5 shrink-0 rounded-full" :class="status.includes('失败') || status.includes('错误') ? 'bg-danger' : 'bg-brand/40'"></span>
        <span class="truncate">{{ status }}</span>
      </p>
      <button type="button" :disabled="isBusy"
        class="shrink-0 text-xs text-muted underline-offset-2 transition hover:text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        @click="confirming = true">
        恢复
      </button>
    </div>
  </div>
</template>
