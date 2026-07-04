<script setup lang="ts">
import { ref } from 'vue'
import ChevronLeftIcon from '../icons/ChevronLeftIcon.vue'
import EyeIcon from '../icons/EyeIcon.vue'
import EyeOffIcon from '../icons/EyeOffIcon.vue'
import GearIcon from '../icons/GearIcon.vue'
import SpinnerIcon from '../icons/SpinnerIcon.vue'
import type { LlmSettings } from '../../types/cleanweb'

defineProps<{
  settings: LlmSettings
  isBusy: boolean
}>()

defineEmits<{
  'update:settings': [value: LlmSettings]
  save: []
  back: []
}>()

const showKey = ref(false)

function updateField(settings: LlmSettings, field: keyof LlmSettings, value: string): LlmSettings {
  return {
    ...settings,
    [field]: value,
  }
}
</script>

<template>
  <div class="grid gap-4">
    <!-- 设置页头：返回 + 齿轮 + 标题 -->
    <div class="flex items-center gap-2">
      <button type="button"
        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition hover:bg-brand-tint hover:text-brand"
        title="返回" aria-label="返回" @click="$emit('back')">
        <ChevronLeftIcon class="h-4 w-4" />
      </button>
      <GearIcon class="h-4 w-4 text-brand" />
      <h2 class="m-0 text-sm font-semibold text-ink">AI 设置</h2>
    </div>

    <!-- 字段区 -->
    <div class="grid gap-4">
      <label class="grid gap-1.5">
        <span class="text-xs font-semibold text-ink-soft">API Key</span>
        <div class="relative">
          <input :value="settings.apiKey" :type="showKey ? 'text' : 'password'" autocomplete="off" spellcheck="false"
            placeholder="sk-..."
            class="h-9 w-full rounded-lg border border-line bg-white px-3 pr-9 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
            @input="$emit('update:settings', updateField(settings, 'apiKey', ($event.target as HTMLInputElement).value))" />
          <button type="button"
            class="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted transition hover:text-ink"
            :title="showKey ? '隐藏' : '显示'" :aria-label="showKey ? '隐藏' : '显示'" @click="showKey = !showKey">
            <EyeOffIcon v-if="showKey" class="h-4 w-4" />
            <EyeIcon v-else class="h-4 w-4" />
          </button>
        </div>
      </label>

      <label class="grid gap-1.5">
        <span class="text-xs font-semibold text-ink-soft">Base URL</span>
        <input :value="settings.baseUrl" type="url" spellcheck="false" placeholder="https://example.com/v1"
          class="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
          @input="$emit('update:settings', updateField(settings, 'baseUrl', ($event.target as HTMLInputElement).value))" />
      </label>

      <label class="grid gap-1.5">
        <span class="text-xs font-semibold text-ink-soft">Model</span>
        <input :value="settings.model" type="text" list="cleanweb-models" spellcheck="false" placeholder="gpt-4o-mini"
          class="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand-soft"
          @input="$emit('update:settings', updateField(settings, 'model', ($event.target as HTMLInputElement).value))" />
      </label>
      <datalist id="cleanweb-models">
        <option value="gpt-4o-mini"></option>
        <option value="gpt-4o"></option>
        <option value="gpt-4.1-mini"></option>
        <option value="gpt-3.5-turbo"></option>
        <option value="deepseek-v4-flash"></option>
        <option value="deepseek-chat"></option>
        <option value="claude-3-5-sonnet-20241022"></option>
      </datalist>
    </div>

    <button type="button" :disabled="isBusy"
      class="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50"
      @click="$emit('save')">
      <SpinnerIcon v-if="isBusy" class="h-4 w-4" />
      <span>{{ isBusy ? '保存中…' : '保存设置' }}</span>
    </button>

    <p class="m-0 rounded-lg bg-brand-tint px-3 py-2 text-xs leading-relaxed text-ink-soft">
      支持 OpenAI 兼容的 <code class="font-mono text-brand">/v1/chat/completions</code> 服务。Base URL 可填到 <code
        class="font-mono text-brand">/v1</code>，也可直接填写完整地址。
    </p>
  </div>
</template>
