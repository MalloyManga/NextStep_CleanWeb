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
  <footer class="cw-material cw-material-edge min-w-0 max-w-full overflow-hidden px-4 pb-3.5 pt-2.5">
    <!-- 确认态：只在真正不可撤销的操作上要二次确认 -->
    <div v-if="confirming"
      class="flex min-w-0 max-w-full items-center justify-between gap-2 overflow-hidden rounded-[10px] bg-danger-tint px-3 py-2">
      <span class="min-w-0 truncate text-[12px] font-medium text-danger">确定移除本页所有规则？</span>
      <div class="flex shrink-0 items-center gap-1">
        <button type="button"
          class="cw-press rounded-full px-3 py-1.5 text-[12px] font-semibold text-danger hover:bg-danger/12"
          @click="confirming = false">
          取消
        </button>
        <button type="button"
          class="cw-press rounded-full bg-danger px-3 py-1.5 text-[12px] font-semibold text-white"
          @click="$emit('reset'); confirmReset()">
          移除
        </button>
      </div>
    </div>

    <!-- 默认态：状态 + 恢复入口 -->
    <div v-else class="flex min-w-0 max-w-full items-center justify-between gap-3 overflow-hidden">
      <p class="m-0 flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-[12px] text-ink-soft" :title="status">
        <SpinnerIcon v-if="isBusy" class="h-3.5 w-3.5 shrink-0 text-brand" />
        <span v-else class="h-2 w-2 shrink-0 rounded-full"
          :class="status.includes('失败') || status.includes('错误') ? 'bg-danger' : 'bg-success'"></span>
        <span class="block min-w-0 flex-1 truncate">{{ status }}</span>
      </p>
      <button type="button" :disabled="isBusy"
        class="cw-press shrink-0 rounded-full bg-track px-3 py-1.5 text-[12px] font-medium text-ink-soft disabled:cursor-not-allowed disabled:opacity-40"
        @click="confirming = true">
        恢复页面
      </button>
    </div>
  </footer>
</template>
