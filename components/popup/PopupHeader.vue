<script setup lang="ts">
defineProps<{
  currentSite: string;
  summaryLabel: string;
}>();

defineEmits<{
  'open-settings': [];
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
      <button
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-brand-tint hover:text-brand"
        title="设置"
        aria-label="设置"
        @click="$emit('open-settings')"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  </header>
</template>
