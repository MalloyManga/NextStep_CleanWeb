import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => {
    const env = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), 'VITE_');
    return {
      plugins: [tailwindcss()],
      define: {
        __LLM_API_KEY__: JSON.stringify(env.VITE_LLM_API_KEY ?? ''),
        __LLM_BASE_URL__: JSON.stringify(env.VITE_LLM_BASE_URL ?? 'https://api.openai.com/v1'),
        __LLM_MODEL__: JSON.stringify(env.VITE_LLM_MODEL ?? 'gpt-4o-mini'),
      },
    };
  },
  manifest: {
    name: 'CleanWeb',
    description: 'Use natural language to clean noisy web pages.',
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
  },
});
