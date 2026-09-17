import type { WxtBrowser } from 'wxt/browser';
import { validateCommand } from './commands';
import { ClaudeSessionCookies } from './cookies';
import { CLAUDE_URL, isClaudeUrl } from './domains';
import { publicError, UserError } from './errors';
import { parseSessionInput, validateSessionKey } from './session';
import {
  DEFAULT_SETTINGS,
  type AppState,
  type Command,
  type Response,
  type SavedAccount,
  type TabContext,
  type Vault,
} from './types';

const VAULT_KEY = 'claude-switch:v1';
const PRIVATE_VAULT_KEY = 'claude-switch:private:v1';

export class SwitchService {
  private queue: Promise<unknown> = Promise.resolve();
  private sessions: ClaudeSessionCookies;

  constructor(private api: WxtBrowser) {
    this.sessions = new ClaudeSessionCookies(api);
  }

  dispatch(input: unknown): Promise<Response> {
    let command: Command;
    try {
      command = validateCommand(input);
    } catch (error) {
      return Promise.resolve({ ok: false, error: publicError(error) });
    }
    const result = this.queue.then(() => this.execute(command));
    this.queue = result.catch(() => {});
    return result;
  }

  private async execute(command: Command): Promise<Response> {
    try {
      const context = await this.context(command.type === 'state' ? undefined : command.tabId);
      const vault = await this.readVault(context);
      let message: string | undefined;
      const getAccount = (id: string) => {
        const account = vault.accounts.find((item) => item.id === id);
        if (!account) throw new UserError('这条账号记录已被移除，请刷新列表。');
        return account;
      };

      switch (command.type) {
        case 'state':
          break;
        case 'save':
          this.upsert(vault, parseSessionInput(command.input), command.name);
          await this.writeVault(context, vault);
          message = '账号已保存到本机';
          break;
        case 'capture': {
          const sessionKey = await this.sessions.current(context.storeId);
          if (!sessionKey) throw new UserError('当前浏览器环境没有 Claude sessionKey，请先登录。');
          this.upsert(vault, sessionKey, command.name, '当前 Claude 账号');
          await this.writeVault(context, vault);
          message = '当前登录态已保存，可继续编辑备注名称';
          break;
        }
        case 'login':
        case 'switch': {
          const account = command.type === 'switch' ? getAccount(command.id) : undefined;
          const sessionKey = account
            ? account.sessionKey
            : parseSessionInput(command.type === 'login' ? command.input : '');
          const saved =
            account ??
            (command.type === 'login' && command.remember
              ? this.upsert(vault, sessionKey, command.name)
              : undefined);
          await this.sessions.replace(sessionKey, context.storeId);
          if (saved) {
            saved.lastUsedAt = Date.now();
            saved.updatedAt = Date.now();
            try {
              await this.writeVault(context, vault);
            } catch {
              throw new UserError('Cookie 已切换，但本地账号记录保存未完成。');
            }
          }
          message = 'Claude 登录 Cookie 已切换；页面刷新后生效';
          if (vault.settings.openAfterSwitch) {
            try {
              await this.open(context);
            } catch {
              // The credential write is complete; the user can open Claude manually.
            }
          }
          break;
        }
        case 'rename': {
          const name = command.name.trim();
          if (!name) throw new UserError('请输入账号备注名称。');
          const account = getAccount(command.id);
          account.name = name;
          account.updatedAt = Date.now();
          await this.writeVault(context, vault);
          message = '账号备注已更新';
          break;
        }
        case 'delete':
          getAccount(command.id);
          vault.accounts = vault.accounts.filter((account) => account.id !== command.id);
          await this.writeVault(context, vault);
          message = '本地账号记录已移除；当前网页登录态保持不变';
          break;
        case 'settings':
          vault.settings = { openAfterSwitch: command.settings.openAfterSwitch };
          await this.writeVault(context, vault);
          break;
        case 'logout':
          await this.sessions.clear(context.storeId);
          message = '当前环境的 Claude 登录 Cookie 已清除，保存的账号仍然保留';
          if (context.isClaude) {
            try {
              await this.api.tabs.reload(context.tabId);
            } catch {
              // The user can refresh manually.
            }
          }
          break;
        case 'open':
          await this.open(context);
          break;
      }
      return { ok: true, state: await this.state(context, vault), message };
    } catch (error) {
      return { ok: false, error: publicError(error) };
    }
  }

  private async context(tabId?: number): Promise<TabContext> {
    const tab =
      tabId === undefined
        ? (await this.api.tabs.query({ active: true, currentWindow: true }))[0]
        : await this.api.tabs.get(tabId);
    if (tab?.id === undefined) throw new UserError('请在浏览器窗口中打开扩展。');
    if (Boolean(tab.incognito) !== Boolean(this.api.extension.inIncognitoContext)) {
      throw new UserError('窗口环境不一致，请在目标窗口重新打开扩展。');
    }
    const stores = await this.api.cookies.getAllCookieStores();
    const store = stores.find((item) => item.tabIds.includes(tab.id!));
    if (!store) throw new UserError('未找到当前窗口的 Cookie 存储区。');
    let hostname = '浏览器页面';
    try {
      hostname = new URL(tab.url ?? '').hostname || hostname;
    } catch {
      // Internal browser pages have no useful URL.
    }
    return {
      tabId: tab.id,
      windowId: tab.windowId,
      storeId: store.id,
      incognito: !!tab.incognito,
      hostname,
      isClaude: isClaudeUrl(tab.url ?? ''),
    };
  }

  private storage(context: TabContext) {
    return context.incognito
      ? { area: this.api.storage.session, key: PRIVATE_VAULT_KEY }
      : { area: this.api.storage.local, key: VAULT_KEY };
  }

  private async readVault(context: TabContext): Promise<Vault> {
    const { area, key } = this.storage(context);
    const raw = (await area.get(key))[key];
    if (raw === undefined) return { version: 1, accounts: [], settings: { ...DEFAULT_SETTINGS } };
    const vault = raw as Vault;
    if (
      vault?.version !== 1 ||
      !Array.isArray(vault.accounts) ||
      vault.accounts.length > 50 ||
      !vault.settings ||
      typeof vault.settings.openAfterSwitch !== 'boolean'
    ) {
      throw new UserError('本地数据格式异常，原始记录已保留，请检查扩展存储。');
    }
    const ids = new Set<string>();
    for (const account of vault.accounts) {
      if (
        !account ||
        typeof account.id !== 'string' ||
        ids.has(account.id) ||
        typeof account.name !== 'string' ||
        typeof account.createdAt !== 'number' ||
        typeof account.updatedAt !== 'number' ||
        (account.lastUsedAt !== undefined && typeof account.lastUsedAt !== 'number')
      ) {
        throw new UserError('本地账号记录格式异常，原始记录已保留。');
      }
      validateSessionKey(account.sessionKey);
      ids.add(account.id);
    }
    return vault;
  }

  private async writeVault(context: TabContext, vault: Vault): Promise<void> {
    const { area, key } = this.storage(context);
    await area.set({ [key]: vault });
  }

  private upsert(
    vault: Vault,
    sessionKey: string,
    name: string,
    fallbackName?: string,
  ): SavedAccount {
    const key = validateSessionKey(sessionKey);
    const existing = vault.accounts.find((account) => account.sessionKey === key);
    if (existing) {
      existing.name = name.trim() || existing.name;
      existing.updatedAt = Date.now();
      return existing;
    }
    if (vault.accounts.length >= 50) {
      throw new UserError('最多保存 50 个账号，请先移除暂时不用的记录。');
    }
    const account: SavedAccount = {
      id: crypto.randomUUID(),
      name: name.trim() || fallbackName || `Claude 账号 ${vault.accounts.length + 1}`,
      sessionKey: key,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    vault.accounts.unshift(account);
    return account;
  }

  private async state(context: TabContext, vault: Vault): Promise<AppState> {
    let sessionKey: string | undefined;
    try {
      sessionKey = await this.sessions.current(context.storeId);
    } catch (error) {
      if (!(error instanceof UserError)) throw error;
    }
    return {
      context,
      settings: vault.settings,
      accounts: vault.accounts.map(({ sessionKey: _sessionKey, ...summary }) => summary),
      hasSession: !!sessionKey,
      activeAccountId: sessionKey
        ? vault.accounts.find((account) => account.sessionKey === sessionKey)?.id
        : undefined,
    };
  }

  private async open(context: TabContext): Promise<void> {
    const tab = await this.api.tabs.get(context.tabId);
    if (isClaudeUrl(tab.url ?? '')) {
      await this.api.tabs.update(context.tabId, { url: CLAUDE_URL, active: true });
    } else {
      await this.api.tabs.create({ url: CLAUDE_URL, active: true, windowId: context.windowId });
    }
  }
}
