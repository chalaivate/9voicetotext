import { BrowserWindow, app } from 'electron';
import { isMac } from '@main/utils/platform';

/**
 * macOS: the app is a menu-bar (tray) app, so the Dock icon is shown only
 * while a real UI window (Settings, History) is open. The overlay is
 * `focusable: false`, which is what excludes it here. A minimised Settings
 * or History window still counts as open (isVisible() would say no), which
 * is why focusability, not visibility, is the test.
 *
 * Call from a window's `closed` handler — by then the closing window is
 * already gone from `getAllWindows()`, so "none left" means exactly that.
 */
export function hideDockIfNoUiWindows(): void {
  if (!isMac) return;
  const stillOpen = BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isFocusable());
  if (!stillOpen) app.dock?.hide();
}
