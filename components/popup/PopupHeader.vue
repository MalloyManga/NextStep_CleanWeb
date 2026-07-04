<script setup lang="ts">
defineProps<{
  currentSite: string;
  summaryLabel: string;
}>();
</script>

<template>
  <header class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
    <div class="flex items-center gap-2 min-w-0">
      <svg
        class="h-5 w-5 shrink-0 text-brand"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6l3 0 2 12 8 0 2 -8 -9 0" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="16" cy="20" r="1" />
      </svg>
      <span class="text-sm font-semibold text-ink">CleanWeb</span>
    </div>
    <div class="flex items-center gap-2 min-w-0">
      <span class="truncate text-xs text-muted" :title="currentSite">{{ currentSite }}</span>
      <span
        v-if="summaryLabel"
        class="rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-medium text-brand"
      >
        {{ summaryLabel }}
      </span>
    </div>
  </header>
</template>
