import { join } from 'node:path';
import { BrowserWindow, screen } from 'electron';
import { OVERLAY } from '@shared/constants';
import { logger } from '@main/utils/logger';
import { getSettings } from '@main/store/settings';

const isDev = !!process.env['ELECTRON_RENDERER_URL'];

export class OverlayWindow {
  private window: BrowserWindow | null = null;

  ensure(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const win = new BrowserWindow({
      width: OVERLAY.width,
      height: OVERLAY.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      show: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        sandbox: true,
        // Renderer needs MediaRecorder + getUserMedia, both available without nodeIntegration.
        nodeIntegration: false
      }
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    if (isDev) {
      const url = process.env['ELECTRON_RENDERER_URL']!;
      void win.loadURL(`${url}/overlay/index.html`);
    } else {
      void win.loadFile(join(__dirname, '../renderer/overlay/index.html'));
    }

    win.on('closed', () => {
      this.window = null;
    });

    this.window = win;
    return win;
  }

  show(): void {
    const win = this.ensure();
    this.positionForSettings(win);
    win.showInactive();
  }

  hide(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.hide();
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  send(channel: string, ...args: unknown[]): void {
    if (!this.window || this.window.isDestroyed()) return;
    if (this.window.webContents.isLoading()) {
      this.window.webContents.once('did-finish-load', () => {
        this.window?.webContents.send(channel, ...args);
      });
      return;
    }
    this.window.webContents.send(channel, ...args);
  }

  /**
   * Centre the overlay strip horizontally on the display that holds the
   * cursor, and align its internal anchor line with
   * `ui.caption.anchorPercent` of that display's work area (default 90%
   * from the top). Caption text sits above the line, the status pill below.
   */
  private positionForSettings(win: BrowserWindow): void {
    try {
      const anchorPercent = getSettings().ui.caption.anchorPercent;
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      const { x, y, width, height } = display.workArea;
      const winW = Math.round(
        Math.min(OVERLAY.maxWidth, Math.max(OVERLAY.minWidth, width * OVERLAY.widthFraction))
      );
      const lineY = y + Math.round((height * anchorPercent) / 100);
      const winX = x + Math.round((width - winW) / 2);
      const winY = lineY - OVERLAY.captionAreaHeight;
      win.setBounds({ x: winX, y: winY, width: winW, height: OVERLAY.height }, false);
    } catch (err) {
      logger.warn('overlay positioning failed', { err: (err as Error).message });
    }
  }
}
