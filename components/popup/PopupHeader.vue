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
  <header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
    <div class="flex items-center gap-2 min-w-0">
      <BroomIcon class="h-5 w-5 shrink-0 text-brand" />
      <span class="text-sm font-semibold text-ink">CleanWeb</span>
    </div>

    <div class="flex items-center gap-2 min-w-0">
      <span class="truncate text-xs text-muted" :title="currentSite">{{ currentSite }}</span>
      <button type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-brand-tint hover:text-brand"
        title="设置" aria-label="设置" @click="$emit('open-settings')">
        <GearIcon class="h-4 w-4" />
      </button>
    </div>
  </header>
</template>
