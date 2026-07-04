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
  <div class="relative grid grid-cols-3 overflow-hidden rounded-lg bg-brand-tint p-0.5">
    <span
      class="col-start-1 row-start-1 rounded-md bg-brand shadow-sm transition-transform duration-200 ease-out"
      :class="{
        'cleanweb-mode-thumb-clean': modelValue === 'clean',
        'cleanweb-mode-thumb-select': modelValue === 'select',
        'cleanweb-mode-thumb-settings': modelValue === 'settings',
      }"
      aria-hidden="true"
    />
    <button
      type="button"
      class="relative z-10 col-start-1 row-start-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200"
      :class="modelValue === 'clean' ? 'text-white' : 'text-ink-soft hover:text-ink'"
      @click="$emit('update:modelValue', 'clean')"
    >
      整页净化
    </button>
    <button
      type="button"
      class="relative z-10 col-start-2 row-start-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200"
      :class="modelValue === 'select' ? 'text-white' : 'text-ink-soft hover:text-ink'"
      @click="$emit('update:modelValue', 'select')"
    >
      精准选择
    </button>
    <button
      type="button"
      class="relative z-10 col-start-3 row-start-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200"
      :class="modelValue === 'settings' ? 'text-white' : 'text-ink-soft hover:text-ink'"
      @click="$emit('update:modelValue', 'settings')"
    >
      设置
    </button>
  </div>
</template>
