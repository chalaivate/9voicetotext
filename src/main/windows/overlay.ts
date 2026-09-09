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
   * Place the overlay in the corner chosen in Settings → General → Overlay
   * position, on whichever display currently holds the cursor.
   */
  private positionForSettings(win: BrowserWindow): void {
    try {
      const position = getSettings().ui.overlayPosition;
      const cursor = screen.getCursorScreenPoint();
      const display = screen.getDisplayNearestPoint(cursor);
      const { x, y, width, height } = display.workArea;
      const right = position === 'top-right' || position === 'bottom-right';
      const bottom = position === 'bottom-left' || position === 'bottom-right';
      const winX = right ? x + width - OVERLAY.width - OVERLAY.edgeOffset : x + OVERLAY.edgeOffset;
      const winY = bottom
        ? y + height - OVERLAY.height - OVERLAY.edgeOffset
        : y + OVERLAY.edgeOffset;
      win.setPosition(Math.round(winX), Math.round(winY), false);
    } catch (err) {
      logger.warn('overlay positioning failed', { err: (err as Error).message });
    }
  }
}
