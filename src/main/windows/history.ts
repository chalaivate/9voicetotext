import { join } from 'node:path';
import { BrowserWindow, app, nativeTheme } from 'electron';
import { APP_NAME } from '@shared/constants';
import { isMac } from '@main/utils/platform';
import { logger } from '@main/utils/logger';
import { hideDockIfNoUiWindows } from './dock';
import { getSettings } from '@main/store/settings';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

/**
 * The History window: recent transcriptions, newest first. Mirrors
 * {@link SettingsWindow} (native title bar, theme-matched background, Dock
 * show/hide on macOS) so the two feel like one app.
 */
export class HistoryWindow {
  private window: BrowserWindow | null = null;

  open(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return this.window;
    }

    const theme = getSettings().ui.theme;
    // Keep the native title bar (and dialogs) in the same theme as the page.
    nativeTheme.themeSource = theme;
    const prefersLight =
      theme === 'light' || (theme === 'system' && !nativeTheme.shouldUseDarkColors);

    const win = new BrowserWindow({
      width: 560,
      height: 680,
      minWidth: 460,
      minHeight: 520,
      title: `${APP_NAME} History`,
      // Native title bar on every platform — see SettingsWindow for why the
      // hidden-inset bar was abandoned.
      titleBarStyle: 'default',
      show: false,
      backgroundColor: prefersLight ? '#F4F6FA' : '#13171F',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    });

    if (isDev) {
      const url = process.env['ELECTRON_RENDERER_URL']!;
      void win.loadURL(`${url}/history/index.html`);
    } else {
      void win.loadFile(join(__dirname, '../renderer/history/index.html'));
    }

    win.once('ready-to-show', () => {
      win.show();
      // Make Dock icon appear while a UI window is open (macOS menu-bar app).
      if (isMac) app.dock?.show();
    });

    win.on('closed', () => {
      this.window = null;
      // Hide Dock icon again only when no other UI window is still open.
      hideDockIfNoUiWindows();
    });

    this.window = win;
    logger.info('history window opened');
    return win;
  }

  close(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  send(channel: string, ...args: unknown[]): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send(channel, ...args);
  }
}
