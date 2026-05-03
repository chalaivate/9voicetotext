import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { logger } from './logger';

const KEY_LINE = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/;

function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = KEY_LINE.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (!key) continue;
    let value = rawValue ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

let cached: Record<string, string> | null = null;

function load(): Record<string, string> {
  if (cached) return cached;
  const candidates = [join(app.getAppPath(), '.env.local'), join(process.cwd(), '.env.local')];
  for (const path of candidates) {
    try {
      const content = readFileSync(path, 'utf8');
      cached = parseEnvFile(content);
      logger.debug('loaded env file', { path, keys: Object.keys(cached) });
      return cached;
    } catch {
      // try next candidate
    }
  }
  cached = {};
  return cached;
}

export function getEnv(key: string): string | undefined {
  return process.env[key] ?? load()[key];
}
