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
  <div class="relative grid grid-cols-2 overflow-hidden rounded-lg bg-brand-tint p-0.5">
    <span
      class="absolute bottom-0.5 left-0.5 top-0.5 rounded-md bg-brand shadow-sm transition-transform duration-200 ease-out"
      style="width: calc((100% - 4px) / 2)"
      :style="{ transform: modelValue === 'select' ? 'translateX(100%)' : 'translateX(0)' }"
      aria-hidden="true"
    />
    <button
      type="button"
      class="relative z-10 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200"
      :class="modelValue === 'clean' ? 'text-white' : 'text-ink-soft hover:text-ink'"
      @click="$emit('update:modelValue', 'clean')"
    >
      整页净化
    </button>
    <button
      type="button"
      class="relative z-10 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200"
      :class="modelValue === 'select' ? 'text-white' : 'text-ink-soft hover:text-ink'"
      @click="$emit('update:modelValue', 'select')"
    >
      精准选择
    </button>
  </div>
</template>
