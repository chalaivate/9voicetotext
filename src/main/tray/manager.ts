import { Menu, Tray, app } from 'electron';
import { APP_NAME, DEFAULT_HOTKEY } from '@shared/constants';
import type { AppState } from '@shared/types';
import { logger } from '@main/utils/logger';
import { trayIcon } from './icons';

export interface TrayDeps {
  openSettings: () => void;
  openHistory?: () => void;
  /** Current hotkey combo from settings (falls back to DEFAULT_HOTKEY). */
  getHotkey?: () => string;
}

const STATE_LABEL: Record<AppState, string> = {
  idle: 'Idle',
  recording: 'Recording…',
  processing: 'Processing…',
  injecting: 'Injecting…',
  success: 'Idle',
  error: 'Error'
};

export class TrayManager {
  private tray: Tray | null = null;
  private deps: TrayDeps | null = null;
  private lastState: AppState = 'idle';

  init(deps: TrayDeps): void {
    this.deps = deps;
    this.tray = new Tray(trayIcon('idle'));
    this.tray.setToolTip(APP_NAME);
    this.refreshMenu('idle');
    logger.info('tray initialized');
  }

  setState(state: AppState): void {
    if (!this.tray) return;
    this.lastState = state;
    this.tray.setImage(trayIcon(state));
    this.tray.setToolTip(state === 'idle' ? APP_NAME : `${APP_NAME} — ${STATE_LABEL[state]}`);
    this.refreshMenu(state);
  }

  /** Rebuild the menu (e.g. after the hotkey changed in Settings). */
  refresh(): void {
    this.refreshMenu(this.lastState);
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  private refreshMenu(state: AppState): void {
    if (!this.tray) return;
    const deps = this.deps;
    if (!deps) return;

    const hotkey = deps.getHotkey?.() || DEFAULT_HOTKEY;

    const menu = Menu.buildFromTemplate([
      { label: APP_NAME, enabled: false },
      { type: 'separator' },
      { label: `Status: ${STATE_LABEL[state]}`, enabled: false },
      { label: `Hotkey: ${hotkey}`, enabled: false },
      { type: 'separator' },
      {
        label: 'Settings…',
        accelerator: 'CommandOrControl+,',
        click: () => deps.openSettings()
      },
      {
        label: 'History…',
        enabled: !!deps.openHistory,
        click: () => deps.openHistory?.()
      },
      { type: 'separator' },
      {
        label: `Quit ${APP_NAME}`,
        accelerator: 'CommandOrControl+Q',
        click: () => app.quit()
      }
    ]);

    this.tray.setContextMenu(menu);
  }
}
