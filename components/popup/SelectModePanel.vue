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
  <div class="grid gap-3">
    <p class="m-0 text-xs leading-relaxed text-muted">
      点击下方按钮，然后在网页上悬停并点击目标区域，选中后会出现操作浮层。
    </p>

    <!-- 本页规则状态 -->
    <div v-if="hasSavedRule"
      class="flex items-center gap-1.5 rounded-lg bg-brand-tint px-2.5 py-1.5 text-xs text-brand">
      <CheckIcon class="h-3.5 w-3.5 shrink-0" />
      <span>本页已有净化规则</span>
    </div>

    <button type="button" :disabled="isBusy"
      class="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      @click="$emit('startPicker')">
      <CursorIcon class="h-4 w-4" />
      <span>进入元素选择模式</span>
    </button>
  </div>
</template>
