<script setup lang="ts">
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
</script>

<template>
  <div class="grid gap-4">
    <label class="grid gap-2">
      <span class="text-sm font-black">自然语言指令</span>
      <textarea
        :value="instruction"
        rows="3"
        class="w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm leading-6 text-ink outline-none transition focus:border-brand focus:ring focus:ring-brand-soft"
        @input="$emit('update:instruction', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <label class="grid gap-2">
      <span class="flex items-center justify-between gap-3 text-sm font-black">
        <span>规则预览</span>
        <span class="text-xs font-bold text-muted">测试 CSS</span>
      </span>
      <textarea
        :value="generatedCss"
        rows="9"
        class="w-full resize-y rounded-xl border border-line bg-code p-3 font-mono text-xs leading-5 text-code-text outline-none transition focus:border-brand focus:ring focus:ring-brand-soft"
        @input="$emit('update:generatedCss', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <div class="grid grid-cols-[1fr_1.25fr] gap-2">
      <button
        type="button"
        :disabled="isBusy"
        class="min-h-11 rounded-xl border border-line bg-surface px-3 text-sm font-black text-ink transition hover:border-brand/50 disabled:cursor-not-allowed disabled:opacity-60"
        @click="$emit('analyze')"
      >
        分析页面
      </button>
      <button
        type="button"
        :disabled="isBusy || !canApply"
        class="min-h-11 rounded-xl border border-brand bg-brand px-3 text-sm font-black text-white shadow-sm transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        @click="$emit('apply')"
      >
        应用并保存
      </button>
    </div>
  </div>
</template>
