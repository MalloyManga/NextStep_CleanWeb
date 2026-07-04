<script setup lang="ts">
defineProps<{
  currentSite: string;
  summaryLabel: string;
}>();
</script>

<template>
  <section class="border-b border-line/80 bg-surface px-5 pb-4 pt-5">
    <header class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <p class="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-brand">CleanWeb</p>
        <h1 class="m-0 text-2xl font-black leading-tight">网页净化器</h1>
      </div>
      <div class="flex h-10 w-10 items-center justify-center rounded-xl border border-brand/20 bg-brand-soft text-lg font-black text-brand">
        C
      </div>
    </header>

    <div class="mt-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border border-line bg-paper px-3 py-2.5">
      <div class="min-w-0">
        <p class="m-0 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Current Site</p>
        <p class="m-0 truncate text-sm font-bold">{{ currentSite }}</p>
      </div>
      <span class="rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-bold text-muted">
        {{ summaryLabel }}
      </span>
    </div>
  </section>
</template>
