<script setup lang="ts">
import { computed } from 'vue'
import type { WorkMode } from './types'

const props = defineProps<{
  modelValue: WorkMode
}>()

defineEmits<{
  'update:modelValue': [value: WorkMode]
}>()

const tabs = [
  { value: 'clean', label: '整页净化' },
  { value: 'select', label: '精准选择' },
  { value: 'rules', label: '规则' },
] as const

const activeTabIndex = computed(() => tabs.findIndex((tab) => tab.value === props.modelValue))
</script>

<template>
  <div class="relative grid grid-cols-3 rounded-[9px] bg-track" role="tablist" aria-label="工作模式">
    <span
      class="cw-segment-thumb absolute inset-y-[3px] left-0 rounded-[7px] bg-thumb shadow-[0_1px_2px_rgba(0,0,0,0.06),0_3px_8px_rgba(0,0,0,0.12)]"
      :class="modelValue === 'settings' ? 'opacity-0' : ''"
      style="width: calc(100% / 3)"
      :style="{ transform: `translateX(${activeTabIndex * 100}%)` }"
      aria-hidden="true"
    />
    <button
      v-for="tab in tabs"
      :key="tab.value"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.value"
      class="cw-press relative z-10 rounded-[7px] px-2 py-2 text-[12px] leading-none tracking-[0.01em] text-ink-soft"
      :class="modelValue === tab.value ? 'font-semibold text-ink' : 'font-medium'"
      @click="$emit('update:modelValue', tab.value)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
