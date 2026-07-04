<script setup lang="ts">
defineProps<{
  isBusy: boolean;
}>();

defineEmits<{
  startPicker: [];
}>();
</script>

<template>
  <div class="grid gap-4">
    <div class="rounded-xl border border-line bg-surface p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <p class="m-0 text-sm font-black">目标元素</p>
          <p class="m-0 mt-1 text-xs font-bold text-muted">尚未选择</p>
        </div>
        <span class="rounded-full bg-paper px-2.5 py-1 text-xs font-black text-brand">Inspect</span>
      </div>
    </div>

    <button
      type="button"
      :disabled="isBusy"
      class="min-h-12 rounded-xl border border-brand bg-brand px-3 text-sm font-black text-white shadow-sm transition hover:bg-[#255c52] disabled:cursor-not-allowed disabled:opacity-60"
      @click="$emit('startPicker')"
    >
      选择网页元素
    </button>

    <div class="rounded-xl border border-line bg-surface p-4">
      <p class="m-0 text-xs font-bold leading-5 text-muted">
        开启后在网页中悬停目标区域，点击选中。操作按钮会出现在鼠标附近。
      </p>
    </div>
  </div>
</template>
