<script setup lang="ts">
import { computed } from 'vue'
import type { WorkMode } from './types'

const props = defineProps<{
  modelValue: WorkMode
}>()

defineEmits<{
  'update:modelValue': [value: WorkMode]
}>()

const activeTabIndex = computed(() => {
  if (props.modelValue === 'select') return 1
  if (props.modelValue === 'rules') return 2
  return 0
})
</script>

<template>
  <div class="relative grid grid-cols-3 overflow-hidden rounded-lg bg-brand-tint p-0.5">
    <span
      class="absolute bottom-0.5 left-0.5 top-0.5 rounded-md bg-brand shadow-sm transition-transform duration-200 ease-out"
      style="width: calc((100% - 4px) / 3)"
      :style="{ transform: `translateX(${activeTabIndex * 100}%)` }"
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
    <button
      type="button"
      class="relative z-10 rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-200"
      :class="modelValue === 'rules' ? 'text-white' : 'text-ink-soft hover:text-ink'"
      @click="$emit('update:modelValue', 'rules')"
    >
      规则
    </button>
  </div>
</template>
