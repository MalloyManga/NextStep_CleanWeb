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
  <div class="flex items-center justify-between gap-3 pt-1">
    <p class="m-0 min-w-0 truncate text-xs text-muted">{{ status }}</p>
    <button
      type="button"
      :disabled="isBusy"
      class="shrink-0 text-xs text-muted underline-offset-2 transition hover:text-danger hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      @click="$emit('reset')"
    >
      恢复
    </button>
  </div>
</template>
