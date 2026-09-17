import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  targetBrowsers: ['chrome'],
  // macOS file pickers hide dot-directories, so keep the unpacked build visible.
  outDir: 'dist',
  manifest: {
    name: 'Claude Switch',
    description: '在本机保存、管理并通过 sessionKey 快速切换多个 Claude 账号。',
    minimum_chrome_version: '116',
    incognito: 'split',
    permissions: ['storage', 'cookies', 'activeTab'],
    host_permissions: ['https://claude.ai/*', 'https://*.claude.ai/*'],
    action: {
      default_title: 'Claude Switch',
      default_icon: {
        16: 'icons/16.png',
        32: 'icons/32.png',
        48: 'icons/48.png',
        128: 'icons/128.png',
      },
    },
    icons: {
      16: 'icons/16.png',
      32: 'icons/32.png',
      48: 'icons/48.png',
      128: 'icons/128.png',
    },
  },
});
