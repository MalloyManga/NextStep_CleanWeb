import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'CleanWeb',
    description: 'Use natural language to clean noisy web pages.',
    permissions: ['activeTab', 'storage', 'scripting'],
    host_permissions: ['<all_urls>'],
  },
});
