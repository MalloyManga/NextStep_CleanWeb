<script setup lang="ts">
import type { LlmSettings } from '../../types/cleanweb';

defineProps<{
  settings: LlmSettings;
  isBusy: boolean;
}>();

defineEmits<{
  'update:settings': [value: LlmSettings];
  save: [];
}>();

function updateField(settings: LlmSettings, field: keyof LlmSettings, value: string): LlmSettings {
  return {
    ...settings,
    [field]: value,
  };
}
</script>

<template>
  <div class="grid gap-3">
    <label class="grid gap-1.5">
      <span class="text-xs font-semibold text-ink-soft">API Key</span>
      <input
        :value="settings.apiKey"
        type="password"
        autocomplete="off"
        placeholder="sk-..."
        class="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        @input="$emit('update:settings', updateField(settings, 'apiKey', ($event.target as HTMLInputElement).value))"
      />
    </label>

    <label class="grid gap-1.5">
      <span class="text-xs font-semibold text-ink-soft">Base URL</span>
      <input
        :value="settings.baseUrl"
        type="url"
        spellcheck="false"
        placeholder="https://api.openai.com/v1"
        class="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        @input="$emit('update:settings', updateField(settings, 'baseUrl', ($event.target as HTMLInputElement).value))"
      />
    </label>

    <label class="grid gap-1.5">
      <span class="text-xs font-semibold text-ink-soft">Model</span>
      <input
        :value="settings.model"
        type="text"
        spellcheck="false"
        placeholder="gpt-4o-mini"
        class="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
        @input="$emit('update:settings', updateField(settings, 'model', ($event.target as HTMLInputElement).value))"
      />
    </label>

    <button
      type="button"
      :disabled="isBusy"
      class="flex h-9 items-center justify-center rounded-lg bg-brand px-3 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      @click="$emit('save')"
    >
      保存设置
    </button>

    <p class="m-0 text-xs leading-relaxed text-muted">
      支持 OpenAI-compatible 的 /v1/chat/completions 服务。Base URL 可以填写到 /v1，也可以直接填写完整 chat/completions 地址。
    </p>
  </div>
</template>
