import { join } from 'node:path';
import { BrowserWindow, app, nativeTheme } from 'electron';
import { APP_NAME } from '@shared/constants';
import { isMac } from '@main/utils/platform';
import { logger } from '@main/utils/logger';
import { getSettings } from '@main/store/settings';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

export class SettingsWindow {
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
      width: 860,
      height: 640,
      minWidth: 760,
      minHeight: 560,
      title: `${APP_NAME} Settings`,
      // Native title bar on every platform. The hidden-inset bar plus
      // `-webkit-app-region: drag` regions repeatedly broke on macOS (nav
      // buttons swallowed clicks, or the window could not be dragged at
      // all), so the window now relies on the OS title bar for moving.
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
      void win.loadURL(`${url}/settings/index.html`);
    } else {
      void win.loadFile(join(__dirname, '../renderer/settings/index.html'));
    }

    win.once('ready-to-show', () => {
      win.show();
      // Make Dock icon appear while Settings is open (macOS menu-bar app).
      if (isMac) app.dock?.show();
    });

    win.on('closed', () => {
      this.window = null;
      // Hide Dock icon again when no UI windows are open (tray-only mode).
      if (isMac) app.dock?.hide();
    });

    this.window = win;
    logger.info('settings window opened');
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
