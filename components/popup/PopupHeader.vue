<script setup lang="ts">
import BroomIcon from '../icons/BroomIcon.vue'
import GearIcon from '../icons/GearIcon.vue'

defineProps<{
  currentSite: string
}>()

defineEmits<{
  'open-settings': []
}>()
</script>

<template>
  <header class="flex items-center justify-between gap-3">
    <div class="flex min-w-0 items-center gap-2">
      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-brand-tint">
        <BroomIcon class="h-4 w-4 text-brand" />
      </span>
      <span class="cw-title min-w-0 truncate text-ink">CleanWeb</span>
    </div>

    <div class="flex min-w-0 items-center gap-1.5">
      <span class="max-w-[150px] truncate rounded-full bg-track px-2.5 py-1 text-[11px] tracking-[0.01em] text-ink-soft"
        :title="currentSite">{{ currentSite }}</span>
      <button type="button"
        class="cw-press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-track hover:text-ink"
        title="设置" aria-label="设置" @click="$emit('open-settings')">
        <GearIcon class="h-[18px] w-[18px]" />
      </button>
    </div>
  </header>
</template>
