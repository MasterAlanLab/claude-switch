import { defineConfig } from 'wxt';
import { CLAUDE_ORIGINS } from './lib/domains';

const icons = {
  16: 'icons/16.png',
  32: 'icons/32.png',
  48: 'icons/48.png',
  128: 'icons/128.png',
};

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Every target ships the same MV3 build; WXT would otherwise default Firefox to MV2.
  targetBrowsers: ['chrome', 'edge', 'firefox'],
  manifestVersion: 3,
  // macOS file pickers hide dot-directories, so keep the unpacked build visible.
  outDir: 'dist',
  // The Firefox sources zip is for AMO review; keep Playwright output out of it.
  zip: { excludeSources: ['artifacts/**'] },
  manifest: ({ browser }) => ({
    name: 'Claude Switch',
    description: '在本机保存、管理并通过 sessionKey 快速切换多个 Claude 账号。',
    permissions: ['storage', 'cookies', 'activeTab'],
    host_permissions: CLAUDE_ORIGINS,
    action: { default_title: 'Claude Switch', default_icon: icons },
    icons,
    ...(browser === 'firefox'
      ? {
          // Firefox only supports spanning mode; the service skips the split-mode
          // context check when the manifest does not ask for it.
          browser_specific_settings: {
            gecko: {
              id: 'claude-switch@masteralanlab.github.io',
              // storage.session and MV3 event pages need Firefox 115+.
              strict_min_version: '115.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {
          minimum_chrome_version: '116',
          incognito: 'split',
        }),
  }),
});
