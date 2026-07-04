<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  instruction: string;
  generatedCss: string;
  isBusy: boolean;
  canApply: boolean;
}>();

defineEmits<{
  'update:instruction': [value: string];
  'update:generatedCss': [value: string];
  analyze: [];
  apply: [];
}>();

const showCss = ref(false);
</script>

<template>
  <div class="grid gap-3">
    <label class="grid gap-1.5">
      <span class="text-xs font-semibold text-ink-soft">净化指令</span>
      <textarea
        :value="instruction"
        rows="3"
        class="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm leading-relaxed text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        @input="$emit('update:instruction', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <button
      type="button"
      :disabled="isBusy"
      class="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      @click="$emit('analyze')"
    >
      <svg
        v-if="isBusy"
        class="h-4 w-4 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" stroke-opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      </svg>
      <span>{{ isBusy ? '正在读取…' : '读取页面并生成' }}</span>
    </button>

    <button
      v-if="canApply"
      type="button"
      :disabled="isBusy"
      class="flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-sm font-medium text-ink-soft transition hover:border-brand/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      @click="$emit('apply')"
    >
      应用并保存
    </button>

    <button
      type="button"
      class="flex items-center gap-1 text-left text-xs text-muted transition hover:text-ink-soft"
      @click="showCss = !showCss"
    >
      <svg
        class="h-3.5 w-3.5 transition-transform"
        :class="showCss ? 'rotate-90' : ''"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M9 6l6 6 -6 6" />
      </svg>
      <span>查看生成的 CSS</span>
    </button>

    <textarea
      v-if="showCss"
      :value="generatedCss"
      rows="7"
      class="w-full resize-y rounded-lg border border-line bg-code p-3 font-mono text-xs leading-relaxed text-code-text outline-none transition focus:border-brand"
      @input="$emit('update:generatedCss', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>
