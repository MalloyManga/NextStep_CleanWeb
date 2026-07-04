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
  <div class="relative grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface p-1">
    <span
      class="absolute bottom-1 left-1 top-1 rounded-lg bg-brand shadow-sm transition-transform duration-300 ease-out"
      style="width: calc((100% - 8px) / 2)"
      :style="{ transform: modelValue === 'select' ? 'translateX(100%)' : 'translateX(0)' }"
      aria-hidden="true"
    />
    <button
      type="button"
      class="relative z-10 rounded-lg px-3 py-2 text-sm font-black transition-colors duration-300"
      :class="modelValue === 'clean' ? 'text-white' : 'text-muted hover:text-ink'"
      @click="$emit('update:modelValue', 'clean')"
    >
      整页净化
    </button>
    <button
      type="button"
      class="relative z-10 rounded-lg px-3 py-2 text-sm font-black transition-colors duration-300"
      :class="modelValue === 'select' ? 'text-white' : 'text-muted hover:text-ink'"
      @click="$emit('update:modelValue', 'select')"
    >
      精准选择
    </button>
  </div>
</template>
