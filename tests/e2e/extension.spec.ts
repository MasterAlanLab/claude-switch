import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let context: BrowserContext;
let popup: Page;
let profile: string;

const firstKey = `sk-ant-sid01-${'personal'.repeat(12)}`;
const secondKey = `sk-ant-sid01-${'work'.repeat(20)}`;

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'claude-switch-test-'));
  const extension = resolve('dist/chrome-mv3');
  await access(join(extension, 'manifest.json'));
  context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 420, height: 600 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  // Keep the test local: any Claude page opened by the extension gets a fixture response.
  await context.route(/^https?:\/\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>Local Claude fixture</h1>' }),
  );
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const extensionId = new URL(worker.url()).host;
  popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await mkdir('artifacts/screenshots', { recursive: true });
});

test.afterAll(async () => {
  await context?.close();
  if (profile) await rm(profile, { recursive: true, force: true });
});

test('real MV3 extension saves, switches, captures, renames, deletes and logs out', async () => {
  const errors: string[] = [];
  popup.on('pageerror', (error) => errors.push(error.message));
  await expect(popup.getByText('把常用 Claude 账号放在这里')).toBeVisible();
  await popup.screenshot({ path: 'artifacts/screenshots/empty.png' });

  await popup.getByRole('button', { name: '切换设置', exact: true }).click();
  await popup.getByRole('switch', { name: /切换后打开 Claude/ }).uncheck();
  await popup.getByRole('button', { name: '切换设置', exact: true }).click();

  async function add(name: string, sessionKey: string) {
    await popup.getByRole('button', { name: '添加账号', exact: true }).click();
    await popup.getByPlaceholder('例如：个人账号、工作账号').fill(name);
    await popup.getByLabel('Claude sessionKey / Cookie JSON', { exact: true }).fill(sessionKey);
    await popup.getByRole('button', { name: '保存账号', exact: true }).click();
    await expect(popup.getByRole('dialog')).not.toBeVisible();
  }

  await add('个人账号', firstKey);
  await add('工作账号', JSON.stringify({ sessionKey: secondKey }));
  await expect(popup.locator('.account-card')).toHaveCount(2);

  await popup.getByRole('button', { name: '切换到 个人账号', exact: true }).click();
  await expect(popup.locator('.connection-main strong')).toHaveText('个人账号');
  expect(
    (await context.cookies('https://claude.ai/')).find((cookie) => cookie.name === 'sessionKey')
      ?.value,
  ).toBe(firstKey);

  await popup.getByRole('button', { name: '切换到 工作账号', exact: true }).click();
  await expect(popup.locator('.connection-main strong')).toHaveText('工作账号');
  expect(
    (await context.cookies('https://claude.ai/')).find((cookie) => cookie.name === 'sessionKey')
      ?.value,
  ).toBe(secondKey);
  await popup.screenshot({ path: 'artifacts/screenshots/accounts.png' });

  await popup.getByRole('button', { name: '保存当前登录', exact: true }).click();
  await expect(popup.getByRole('status')).toContainText('当前登录态已保存');
  await expect(popup.locator('.account-card')).toHaveCount(2);

  await popup.getByRole('button', { name: '管理 工作账号', exact: true }).click();
  await popup.getByRole('menuitem', { name: '编辑备注', exact: true }).click();
  await popup.getByRole('textbox', { name: '账号备注', exact: true }).fill('团队账号');
  await popup.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(popup.getByRole('dialog')).not.toBeVisible();

  await popup.getByRole('button', { name: '管理 个人账号', exact: true }).click();
  await popup.getByRole('menuitem', { name: '移除账号', exact: true }).click();
  await popup.getByRole('button', { name: '确认移除', exact: true }).click();
  await expect(popup.locator('.account-card')).toHaveCount(1);

  await popup.getByRole('button', { name: '快捷登录', exact: true }).click();
  const input = popup.getByLabel('Claude sessionKey / Cookie JSON', { exact: true });
  await input.fill(`Cookie: theme=dark; sessionKey=${firstKey}`);
  await expect(popup.getByRole('button', { name: /切换并登录/ })).toBeEnabled();
  await popup.getByText('如何获取 sessionKey？', { exact: true }).click();
  await expect(popup.getByText(/Application → Cookies/)).toBeVisible();
  await popup.screenshot({ path: 'artifacts/screenshots/quick-login.png' });
  await popup.getByRole('button', { name: /切换并登录/ }).click();
  await expect(input).toHaveValue('');

  await popup.getByRole('button', { name: '切换设置', exact: true }).click();
  await popup.getByRole('button', { name: '清除当前 sessionKey', exact: true }).click();
  await popup.getByRole('button', { name: '清除登录', exact: true }).click();
  await expect(popup.getByRole('dialog')).not.toBeVisible();
  expect(
    (await context.cookies('https://claude.ai/')).filter((cookie) => cookie.name === 'sessionKey'),
  ).toHaveLength(0);
  expect(errors).toEqual([]);
});
