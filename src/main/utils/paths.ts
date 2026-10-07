import { join } from 'node:path';
import { app } from 'electron';

/**
 * Folder holding the app + tray icons at runtime.
 *
 * - Dev (`npm run dev` / `npm start`): `<repo>/resources/icons`.
 * - Packaged: electron-builder copies them via `extraResources` (see
 *   electron-builder.yml) to `<install dir>/resources/icons`, i.e.
 *   `process.resourcesPath/icons`. They are NOT inside app.asar, because
 *   `files` only ships `out/**`.
 */
export function iconsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icons')
    : join(app.getAppPath(), 'resources', 'icons');
}

/** Window icon (title bar / taskbar). Windows prefers the multi-size .ico. */
export function appIconPath(platform: NodeJS.Platform = process.platform): string {
  return join(iconsDir(), platform === 'win32' ? 'icon.ico' : 'icon.png');
}
