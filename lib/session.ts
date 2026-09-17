import { UserError } from './errors';

export const SESSION_COOKIE = 'sessionKey';
export const MAX_KEY_LENGTH = 8 * 1024;
export const MAX_INPUT_LENGTH = 256 * 1024;

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateSessionKey(value: unknown): string {
  if (typeof value !== 'string') throw new UserError('sessionKey 应为文本。');
  const key = value.trim();
  if (
    key.length < 32 ||
    key.length > MAX_KEY_LENGTH ||
    /[\s;\u0000-\u001f\u007f]/.test(key) ||
    !/^[A-Za-z0-9._~+/=-]+$/.test(key)
  ) {
    throw new UserError('sessionKey 格式有误，请粘贴完整的 Cookie 值。');
  }
  if (key.startsWith('sk-ant-api')) {
    throw new UserError('这是 Claude API Key；这里需要 claude.ai Cookie 中的 sessionKey。');
  }
  return key;
}

function cookieValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length === 1) return cookieValue(value[0]);
  if (object(value) && typeof value.value === 'string') return value.value;
}

function readCookieCollection(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const matches = value.filter(
      (item) => object(item) && item.name === SESSION_COOKIE && typeof item.value === 'string',
    ) as Array<{ name: string; value: string }>;
    if (matches.length > 1) throw new UserError('检测到多个 sessionKey，请只保留一个。');
    return matches[0]?.value;
  }
  if (!object(value)) return;
  if (value.name === SESSION_COOKIE && typeof value.value === 'string') return value.value;
  if (value[SESSION_COOKIE] !== undefined) return cookieValue(value[SESSION_COOKIE]);
  if (value.cookies !== undefined) return readCookieCollection(value.cookies);
}

export function parseSessionInput(input: string): string {
  const text = input.trim();
  if (!text) throw new UserError('请先粘贴 sessionKey。');
  if (text.length > MAX_INPUT_LENGTH)
    throw new UserError('输入内容过长，请只粘贴当前账号的 sessionKey。');

  if (text.startsWith('{') || text.startsWith('[') || text.startsWith('"')) {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new UserError('JSON 格式有误，请检查括号、引号和逗号。');
    }
    if (typeof data === 'string') return validateSessionKey(data);
    const key = readCookieCollection(data);
    if (!key) throw new UserError('JSON 中未找到名为 sessionKey 的 Cookie。');
    return validateSessionKey(key);
  }

  const header = text.replace(/^Cookie:\s*/i, '');
  const cookieParts = header.split(/;|\r?\n/);
  for (const part of cookieParts) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === SESSION_COOKIE) {
      return validateSessionKey(part.slice(eq + 1));
    }
  }
  return validateSessionKey(text);
}
