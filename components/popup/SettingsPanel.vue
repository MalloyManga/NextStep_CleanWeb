<script setup lang="ts">
import { ref } from 'vue';
import type { LlmSettings } from '../../types/cleanweb';

defineProps<{
  settings: LlmSettings;
  isBusy: boolean;
}>();

defineEmits<{
  'update:settings': [value: LlmSettings];
  save: [];
  back: [];
}>();

const showKey = ref(false);

function updateField(settings: LlmSettings, field: keyof LlmSettings, value: string): LlmSettings {
  return {
    ...settings,
    [field]: value,
  };
}
</script>

<template>
  <div class="grid gap-4">
    <!-- 设置页头：返回 + 齿轮 + 标题 -->
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-brand-tint hover:text-brand"
        title="返回"
        aria-label="返回"
        @click="$emit('back')"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18l-6 -6 6 -6" />
        </svg>
      </button>
      <svg
        class="h-4 w-4 text-brand"
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
      <h2 class="m-0 text-sm font-semibold text-ink">AI 设置</h2>
    </div>

    <!-- 字段区 -->
    <div class="grid gap-4">
      <label class="grid gap-1.5">
        <span class="text-xs font-semibold text-ink-soft">API Key</span>
        <div class="relative">
          <input
            :value="settings.apiKey"
            :type="showKey ? 'text' : 'password'"
            autocomplete="off"
            spellcheck="false"
            placeholder="sk-..."
            class="h-9 w-full rounded-lg border border-line bg-white px-3 pr-9 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
            @input="$emit('update:settings', updateField(settings, 'apiKey', ($event.target as HTMLInputElement).value))"
          />
          <button
            type="button"
            class="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted transition hover:text-ink"
            :title="showKey ? '隐藏' : '显示'"
            :aria-label="showKey ? '隐藏' : '显示'"
            @click="showKey = !showKey"
          >
            <svg
              v-if="showKey"
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <path d="M1 1l22 22" />
            </svg>
            <svg
              v-else
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </label>

      <label class="grid gap-1.5">
        <span class="text-xs font-semibold text-ink-soft">Base URL</span>
        <input
          :value="settings.baseUrl"
          type="url"
          spellcheck="false"
          placeholder="https://api.openai.com/v1"
          class="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
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
          class="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
          @input="$emit('update:settings', updateField(settings, 'model', ($event.target as HTMLInputElement).value))"
        />
      </label>
    </div>

    <button
      type="button"
      :disabled="isBusy"
      class="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      @click="$emit('save')"
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
      <span>{{ isBusy ? '保存中…' : '保存设置' }}</span>
    </button>

    <p class="m-0 rounded-lg bg-brand-tint px-3 py-2 text-xs leading-relaxed text-ink-soft">
      支持 OpenAI 兼容的 <code class="font-mono text-brand">/v1/chat/completions</code> 服务。Base URL 可填到 <code class="font-mono text-brand">/v1</code>，也可直接填写完整地址。
    </p>
  </div>
</template>
