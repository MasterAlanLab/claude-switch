import type { Browser, WxtBrowser } from 'wxt/browser';
import { describe, expect, it, vi } from 'vitest';
import { ClaudeSessionCookies } from '../lib/cookies';
import { SESSION_COOKIE } from '../lib/session';

type Cookie = Browser.cookies.Cookie;

const oldKey = `sk-ant-sid01-${'old'.repeat(28)}`;
const newKey = `sk-ant-sid01-${'new'.repeat(28)}`;

function makeCookie(value: string, overrides: Partial<Cookie> = {}): Cookie {
  return {
    domain: '.claude.ai',
    expirationDate: undefined,
    firstPartyDomain: undefined,
    hostOnly: false,
    httpOnly: true,
    name: SESSION_COOKIE,
    partitionKey: undefined,
    path: '/',
    sameSite: 'lax',
    secure: true,
    session: true,
    storeId: '0',
    value,
    ...overrides,
  } as Cookie;
}

function mockCookies(initial: Cookie[] = []) {
  let jar = [...initial];
  const getAll = vi.fn(async (details: Browser.cookies.GetAllDetails) =>
    jar.filter(
      (cookie) =>
        (!details.name || cookie.name === details.name) &&
        (!details.storeId || cookie.storeId === details.storeId) &&
        (!details.domain || cookie.domain.replace(/^\./, '') === details.domain.replace(/^\./, '')),
    ),
  );
  const get = vi.fn(
    async (details: Browser.cookies.CookieDetails) =>
      jar.find((cookie) => cookie.name === details.name && cookie.storeId === details.storeId) ??
      null,
  );
  const remove = vi.fn(async (details: Browser.cookies.CookieDetails) => {
    const index = jar.findIndex(
      (cookie) =>
        cookie.name === details.name &&
        cookie.storeId === details.storeId &&
        new URL(details.url).pathname === cookie.path,
    );
    if (index < 0) return null;
    const [removed] = jar.splice(index, 1);
    return removed ? { name: removed.name, url: details.url, storeId: removed.storeId } : null;
  });
  const set = vi.fn(async (details: Browser.cookies.SetDetails) => {
    const cookie = makeCookie(details.value ?? '', {
      domain: details.domain ?? 'claude.ai',
      hostOnly: !details.domain,
      httpOnly: details.httpOnly ?? false,
      name: details.name ?? '',
      path: details.path ?? '/',
      sameSite: details.sameSite ?? 'unspecified',
      secure: details.secure ?? false,
      storeId: details.storeId ?? '0',
    });
    jar.push(cookie);
    return cookie;
  });
  const api = { cookies: { getAll, get, remove, set } };
  return { api, browser: api as unknown as Pick<WxtBrowser, 'cookies'>, jar: () => jar };
}

describe('Claude cookie replacement', () => {
  it('clears every old scope before writing a secure domain cookie', async () => {
    const mock = mockCookies([
      makeCookie(oldKey),
      makeCookie(oldKey, { domain: 'claude.ai', hostOnly: true }),
      makeCookie('keep-me', { name: 'lastActiveOrg' }),
      makeCookie(oldKey, { storeId: '1' }),
    ]);
    await new ClaudeSessionCookies(mock.browser).replace(newKey, '0');
    expect(mock.jar()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'lastActiveOrg', value: 'keep-me' }),
        expect.objectContaining({ name: SESSION_COOKIE, value: oldKey, storeId: '1' }),
        expect.objectContaining({
          name: SESSION_COOKIE,
          value: newKey,
          domain: '.claude.ai',
          secure: true,
          httpOnly: true,
          sameSite: 'lax',
          session: true,
          storeId: '0',
        }),
      ]),
    );
    expect(
      mock.jar().filter((item) => item.name === SESSION_COOKIE && item.storeId === '0'),
    ).toHaveLength(1);
  });

  it('restores the previous cookie after a write failure', async () => {
    const mock = mockCookies([makeCookie(oldKey)]);
    mock.api.cookies.set.mockRejectedValueOnce(new Error('synthetic failure'));
    await expect(new ClaudeSessionCookies(mock.browser).replace(newKey, '0')).rejects.toThrow(
      '已恢复',
    );
    expect(mock.jar()).toEqual([expect.objectContaining({ value: oldKey })]);
  });

  it('validates new input before touching the current cookie', async () => {
    const mock = mockCookies([makeCookie(oldKey)]);
    await expect(new ClaudeSessionCookies(mock.browser).replace('short', '0')).rejects.toThrow(
      '格式',
    );
    expect(mock.api.cookies.remove).not.toHaveBeenCalled();
    expect(mock.jar()[0]?.value).toBe(oldKey);
  });

  it('uses the original path while clearing', async () => {
    const mock = mockCookies([makeCookie(oldKey, { path: '/legacy' })]);
    await new ClaudeSessionCookies(mock.browser).clear('0');
    expect(mock.api.cookies.remove).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://claude.ai/legacy' }),
    );
  });
});
