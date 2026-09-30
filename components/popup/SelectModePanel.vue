<script setup lang="ts">
import CheckIcon from '../icons/CheckIcon.vue'
import CursorIcon from '../icons/CursorIcon.vue'

defineProps<{
  isBusy: boolean
  hasSavedRule: boolean
}>()

defineEmits<{
  startPicker: []
}>()
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-3">
    <p class="cw-body m-0 text-ink-soft">
      点击下方按钮，然后在网页上悬停并点击目标区域，选中后会出现操作浮层。
    </p>

    <!-- 本页规则状态 -->
    <div v-if="hasSavedRule" class="cw-elevated flex items-center gap-2.5 px-3 py-2.5">
      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/15">
        <CheckIcon class="h-3 w-3 text-success" />
      </span>
      <span class="cw-body min-w-0 flex-1 text-ink">本页已有净化规则</span>
    </div>

    <button type="button" :disabled="isBusy"
      class="cw-press mt-auto flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand text-[15px] font-semibold tracking-[-0.01em] text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
      @click="$emit('startPicker')">
      <CursorIcon class="h-[18px] w-[18px]" />
      <span>进入元素选择模式</span>
    </button>
  </div>
</template>
