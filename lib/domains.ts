export const CLAUDE_URL = 'https://claude.ai/';

export function isClaudeHost(host: string): boolean {
  return host === 'claude.ai' || host.endsWith('.claude.ai');
}

export function isClaudeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && isClaudeHost(parsed.hostname);
  } catch {
    return false;
  }
}
