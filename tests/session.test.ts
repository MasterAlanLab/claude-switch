import { describe, expect, it } from 'vitest';
import { validateCommand } from '../lib/commands';
import { isClaudeHost, isClaudeUrl } from '../lib/domains';
import { publicError, UserError } from '../lib/errors';
import { parseSessionInput, SESSION_COOKIE, validateSessionKey } from '../lib/session';

const key = `sk-ant-sid01-${'synthetic'.repeat(12)}`;

describe('sessionKey parsing', () => {
  it.each([
    key,
    JSON.stringify(key),
    `${SESSION_COOKIE}=${key}`,
    `Cookie: theme=dark; ${SESSION_COOKIE}=${key}; foo=bar`,
    JSON.stringify({ [SESSION_COOKIE]: key }),
    JSON.stringify({ [SESSION_COOKIE]: { value: key } }),
    JSON.stringify([{ name: SESSION_COOKIE, value: key }]),
    JSON.stringify({ cookies: [{ name: SESSION_COOKIE, value: key }] }),
    JSON.stringify({ name: SESSION_COOKIE, value: key }),
  ])('extracts the credential from supported input (%#)', (input) => {
    expect(parseSessionInput(input)).toBe(key);
  });

  it.each([
    '',
    'short',
    '{broken',
    '<script>alert(1)</script>',
    JSON.stringify({ accessToken: key }),
    JSON.stringify([
      { name: SESSION_COOKIE, value: key },
      { name: SESSION_COOKIE, value: `${key}other` },
    ]),
    `sk-ant-api${'x'.repeat(40)}`,
  ])('rejects malformed or wrong credentials (%#)', (input) => {
    expect(() => parseSessionInput(input)).toThrow(UserError);
  });

  it('does not require a brittle prefix while still rejecting cookie delimiters', () => {
    expect(validateSessionKey(`opaque-${'x'.repeat(40)}`)).toContain('opaque-');
    expect(() => validateSessionKey(`${key};other=value`)).toThrow();
  });
});

describe('boundaries', () => {
  it('matches real Claude HTTPS hosts only', () => {
    for (const host of ['claude.ai', 'app.claude.ai']) expect(isClaudeHost(host)).toBe(true);
    for (const host of ['fakeclaude.ai', 'claude.ai.evil.test', 'anthropic.com']) {
      expect(isClaudeHost(host)).toBe(false);
    }
    expect(isClaudeUrl('http://claude.ai/')).toBe(false);
    expect(isClaudeUrl('https://claude.ai@evil.test/')).toBe(false);
  });

  it('redacts underlying browser errors', () => {
    expect(publicError(new Error(key))).not.toContain(key);
  });

  it('validates extension messages before dispatch', () => {
    expect(validateCommand({ type: 'state' })).toEqual({ type: 'state' });
    for (const command of [
      { type: 'unknown', tabId: 1 },
      { type: 'switch', id: 'x' },
      { type: 'login', tabId: 1, input: key, name: '', remember: 'true' },
      { type: 'settings', tabId: 1, settings: {} },
    ]) {
      expect(() => validateCommand(command)).toThrow();
    }
  });
});
