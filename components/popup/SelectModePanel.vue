<script setup lang="ts">
defineProps<{
  isBusy: boolean;
}>();

defineEmits<{
  startPicker: [];
}>();
</script>

<template>
  <div class="grid gap-3">
    <p class="m-0 text-xs leading-relaxed text-muted">
      点击下方按钮，然后在网页上悬停并点击目标区域，选中后会出现操作浮层。
    </p>

    <button
      type="button"
      :disabled="isBusy"
      class="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      @click="$emit('startPicker')"
    >
      <svg
        class="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M4 4l6 16 2 -7 7 -2z" />
      </svg>
      <span>进入元素选择模式</span>
    </button>
  </div>
</template>
