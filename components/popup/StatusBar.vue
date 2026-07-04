<script setup lang="ts">
defineProps<{
  status: string;
  isBusy: boolean;
}>();

defineEmits<{
  reset: [];
}>();
</script>

<template>
  <div class="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
    <p class="m-0 min-w-0 truncate text-xs font-bold text-muted">{{ status }}</p>
    <button
      type="button"
      :disabled="isBusy"
      class="rounded-lg px-3 py-1.5 text-xs font-black text-danger transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-60"
      @click="$emit('reset')"
    >
      恢复
    </button>
  </div>
</template>
