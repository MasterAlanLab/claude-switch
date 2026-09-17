import type { Browser, WxtBrowser } from 'wxt/browser';
import { CLAUDE_URL } from './domains';
import { UserError } from './errors';
import { SESSION_COOKIE, validateSessionKey } from './session';

type Cookie = Browser.cookies.Cookie;

export class ClaudeSessionCookies {
  constructor(private api: Pick<WxtBrowser, 'cookies'>) {}

  async list(storeId: string): Promise<Cookie[]> {
    const cookies = await this.api.cookies.getAll({
      domain: 'claude.ai',
      name: SESSION_COOKIE,
      storeId,
    });
    return cookies.filter(
      (cookie) =>
        cookie.name === SESSION_COOKIE && cookie.domain.replace(/^\./, '') === 'claude.ai',
    );
  }

  async current(storeId: string): Promise<string | undefined> {
    const selected = await this.api.cookies.get({
      url: CLAUDE_URL,
      name: SESSION_COOKIE,
      storeId,
    });
    return selected ? validateSessionKey(selected.value) : undefined;
  }

  private removalDetails(cookie: Cookie) {
    return {
      url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
      name: cookie.name,
      storeId: cookie.storeId,
      ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
    };
  }

  async clear(storeId: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cookies = await this.list(storeId);
      if (!cookies.length) return;
      for (const cookie of cookies) await this.api.cookies.remove(this.removalDetails(cookie));
    }
    if ((await this.list(storeId)).length) {
      throw new UserError('旧 sessionKey 清理未完成，请关闭 Claude 页面后重试。');
    }
  }

  private async restore(cookies: Cookie[]): Promise<void> {
    for (const cookie of cookies) {
      const restored = await this.api.cookies.set({
        url: `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        storeId: cookie.storeId,
        ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        ...(cookie.expirationDate ? { expirationDate: cookie.expirationDate } : {}),
        ...(cookie.partitionKey ? { partitionKey: cookie.partitionKey } : {}),
      });
      if (!restored) throw new Error('Cookie restoration failed');
    }
  }

  async replace(input: string, storeId: string): Promise<void> {
    const sessionKey = validateSessionKey(input);
    const previous = await this.list(storeId);
    try {
      await this.clear(storeId);
      const cookie = await this.api.cookies.set({
        url: CLAUDE_URL,
        name: SESSION_COOKIE,
        value: sessionKey,
        domain: '.claude.ai',
        path: '/',
        storeId,
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
      });
      if (!cookie || cookie.value !== sessionKey || (await this.current(storeId)) !== sessionKey) {
        throw new Error('Cookie verification failed');
      }
    } catch {
      try {
        await this.clear(storeId);
        await this.restore(previous);
      } catch {
        throw new UserError('写入未完成，原登录态恢复也未完成，请在 Claude 页面重新登录。');
      }
      throw new UserError('sessionKey 写入未完成，已恢复原来的 Claude 登录态。');
    }
  }
}
