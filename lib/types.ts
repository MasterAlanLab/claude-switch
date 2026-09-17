export interface Settings {
  openAfterSwitch: boolean;
}

export const DEFAULT_SETTINGS: Settings = { openAfterSwitch: true };

export interface SavedAccount {
  id: string;
  name: string;
  sessionKey: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

export type AccountSummary = Omit<SavedAccount, 'sessionKey'>;

export interface Vault {
  version: 1;
  accounts: SavedAccount[];
  settings: Settings;
}

export interface TabContext {
  tabId: number;
  windowId: number;
  storeId: string;
  incognito: boolean;
  hostname: string;
  isClaude: boolean;
}

export interface AppState {
  accounts: AccountSummary[];
  settings: Settings;
  context: TabContext;
  hasSession: boolean;
  activeAccountId?: string;
}

export type Command =
  | { type: 'state' }
  | { type: 'save'; input: string; name: string; tabId: number }
  | { type: 'capture'; name: string; tabId: number }
  | { type: 'login'; input: string; name: string; remember: boolean; tabId: number }
  | { type: 'switch'; id: string; tabId: number }
  | { type: 'rename'; id: string; name: string; tabId: number }
  | { type: 'delete'; id: string; tabId: number }
  | { type: 'settings'; settings: Settings; tabId: number }
  | { type: 'logout'; tabId: number }
  | { type: 'open'; tabId: number };

export type Response =
  { ok: true; state: AppState; message?: string } | { ok: false; error: string };
