import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Chromium keeps its built-in (user-agent) stylesheet — the rules that hide
 * `<head>`, make `<div>` a block, give `<select>` its arrow, etc. — inside
 * `resources.pak` next to the executable. If that file is missing or
 * unreadable (interrupted Electron download in node_modules, antivirus
 * quarantine, a half-copied install folder), every window renders with
 * page text from `<head>` visible and the whole layout collapsed inline.
 *
 * We can't repair the install from inside the app, but we can detect it
 * and tell the user to reinstall instead of leaving them with a broken UI.
 */
export function chromiumResourcesPakPath(
  execPath: string,
  platform: NodeJS.Platform
): string | null {
  // macOS keeps it inside "Electron Framework.framework/Resources"; the
  // bundle is signed as a unit, so a partial copy is far less likely.
  if (platform === 'darwin') return null;
  return join(dirname(execPath), 'resources.pak');
}

export interface IntegrityResult {
  ok: boolean;
  missing: string[];
}

export function checkChromiumResources(
  execPath: string = process.execPath,
  platform: NodeJS.Platform = process.platform,
  exists: (p: string) => boolean = existsSync
): IntegrityResult {
  const pak = chromiumResourcesPakPath(execPath, platform);
  if (!pak) return { ok: true, missing: [] };
  const missing = exists(pak) ? [] : [pak];
  return { ok: missing.length === 0, missing };
}
