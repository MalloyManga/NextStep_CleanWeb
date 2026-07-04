<script setup lang="ts">
import type { WorkMode } from './types';

defineProps<{
  modelValue: WorkMode;
}>();

defineEmits<{
  'update:modelValue': [value: WorkMode];
}>();
</script>

<template>
  <div class="grid grid-cols-2 rounded-xl border border-line bg-surface p-1">
    <button
      type="button"
      class="rounded-lg px-3 py-2 text-sm font-black transition"
      :class="modelValue === 'clean' ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink'"
      @click="$emit('update:modelValue', 'clean')"
    >
      整页净化
    </button>
    <button
      type="button"
      class="rounded-lg px-3 py-2 text-sm font-black transition"
      :class="modelValue === 'select' ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-ink'"
      @click="$emit('update:modelValue', 'select')"
    >
      精准选择
    </button>
  </div>
</template>
