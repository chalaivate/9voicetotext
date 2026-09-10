import { join } from 'node:path';
import { app, nativeImage, type NativeImage } from 'electron';
import type { AppState } from '@shared/types';

/**
 * Tray icons are shipped as `extraResources` (see electron-builder.yml) so
 * they live under `<app>/Contents/Resources/resources/icons` in a packaged
 * build, and under the repo's `resources/icons` during `npm run dev`.
 */
const iconRoot = app.isPackaged
  ? join(process.resourcesPath, 'resources', 'icons')
  : join(__dirname, '../../resources/icons');

/**
 * Base file names. Electron automatically picks up the `@2x` sibling for
 * HiDPI menu bars / taskbars, so we only reference the 1x name here.
 *
 * - `idle` is a monochrome glyph: black (macOS template image, inverts with
 *   light/dark menu bar) or white (Windows dark taskbar via `-light`).
 * - `recording` / `processing` carry a coloured status dot and are NOT marked
 *   as template images, otherwise macOS would flatten the colour away.
 */
const filenameFor: Record<AppState, string> = {
  idle: 'tray-idle',
  recording: 'tray-recording',
  processing: 'tray-processing',
  injecting: 'tray-processing',
  success: 'tray-idle',
  error: 'tray-idle'
};

export function trayIcon(state: AppState): NativeImage {
  const base = filenameFor[state] ?? filenameFor.idle;
  const isMac = process.platform === 'darwin';
  // Windows taskbars are dark by default, so use the white glyph there.
  const variant = isMac ? base : `${base}-light`;
  const image = nativeImage.createFromPath(join(iconRoot, `${variant}.png`));
  if (isMac && base === 'tray-idle') {
    image.setTemplateImage(true);
  }
  return image;
}
