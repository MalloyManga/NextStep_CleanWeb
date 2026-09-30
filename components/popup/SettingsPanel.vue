<script setup lang="ts">
import { ref } from 'vue'
import ChevronLeftIcon from '../icons/ChevronLeftIcon.vue'
import EyeIcon from '../icons/EyeIcon.vue'
import EyeOffIcon from '../icons/EyeOffIcon.vue'
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
  <div class="flex min-h-full flex-col">
    <!-- Apple 子页导航栏：左侧返回、中间标题、右侧提交 -->
    <header class="cw-material cw-material-edge sticky top-0 z-10 flex items-center gap-1 px-2.5 pb-2.5 pt-3">
      <button type="button"
        class="cw-press flex shrink-0 items-center gap-0.5 rounded-full py-1.5 pl-1 pr-2.5 text-[13px] font-medium text-brand hover:bg-brand-tint"
        title="返回" @click="$emit('back')">
        <ChevronLeftIcon class="h-4 w-4" />
        <span>返回</span>
      </button>

      <h2 class="cw-title min-w-0 flex-1 truncate text-center text-ink">AI 设置</h2>

      <button type="button" :disabled="isBusy"
        class="cw-press flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-brand px-2.5 text-[12px] font-semibold tracking-[0.01em] text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40"
        @click="$emit('save')">
        <SpinnerIcon v-if="isBusy" class="h-3.5 w-3.5" />
        <span>{{ isBusy ? '保存中' : '存储' }}</span>
      </button>
    </header>

    <div class="grid flex-1 content-start gap-5 px-4 py-4">
      <label class="grid gap-2">
        <span class="cw-section-title">API Key</span>
        <div class="cw-field relative">
          <input :value="settings.apiKey" :type="showKey ? 'text' : 'password'" autocomplete="off" spellcheck="false"
            placeholder="sk-..."
            class="h-10 w-full rounded-[8px] bg-transparent px-3 pr-10 text-[13px] text-ink outline-none placeholder:text-muted"
            @input="$emit('update:settings', updateField(settings, 'apiKey', ($event.target as HTMLInputElement).value))" />
          <button type="button"
            class="cw-press absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-track hover:text-ink"
            :title="showKey ? '隐藏' : '显示'" :aria-label="showKey ? '隐藏' : '显示'" @click="showKey = !showKey">
            <EyeOffIcon v-if="showKey" class="h-4 w-4" />
            <EyeIcon v-else class="h-4 w-4" />
          </button>
        </div>
      </label>

      <label class="grid gap-2">
        <span class="cw-section-title">Base URL</span>
        <input :value="settings.baseUrl" type="url" spellcheck="false" placeholder="https://example.com/v1"
          class="cw-field h-10 w-full rounded-[8px] px-3 text-[13px] text-ink outline-none placeholder:text-muted"
          @input="$emit('update:settings', updateField(settings, 'baseUrl', ($event.target as HTMLInputElement).value))" />
      </label>

      <label class="grid gap-2">
        <span class="cw-section-title">Model</span>
        <input :value="settings.model" type="text" list="cleanweb-models" spellcheck="false" placeholder="gpt-4o-mini"
          class="cw-field h-10 w-full rounded-[8px] px-3 text-[13px] text-ink outline-none placeholder:text-muted"
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

      <p class="cw-footnote m-0 leading-relaxed">
        支持 OpenAI 兼容的 <code class="font-mono text-[10px] text-brand">/v1/chat/completions</code> 服务。Base URL 可填到
        <code class="font-mono text-[10px] text-brand">/v1</code>，也可直接填写完整地址。
      </p>
    </div>
  </div>
</template>
