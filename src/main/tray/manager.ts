import { Menu, Tray, app } from 'electron';
import { APP_NAME } from '@shared/constants';
import type { AppState, HotkeyMode } from '@shared/types';
import { logger } from '@main/utils/logger';
import { trayIcon } from './icons';

export interface TrayDeps {
  openSettings: () => void;
  openHistory?: () => void;
  /** Current hotkey combo + mode from settings (shown in the menu). */
  getHotkey: () => { combo: string; mode: HotkeyMode };
}

const modeLabel: Record<HotkeyMode, string> = {
  toggle: 'Toggle',
  'push-to-talk': 'Push-to-talk',
  'auto-stop': 'Auto-stop on silence'
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

    const stateLabel: Record<AppState, string> = {
      idle: 'Idle',
      recording: 'Recording…',
      processing: 'Processing…',
      injecting: 'Injecting…',
      success: 'Idle',
      error: 'Error'
    };

    const hotkey = deps.getHotkey();
    const menu = Menu.buildFromTemplate([
      { label: APP_NAME, enabled: false },
      { type: 'separator' },
      { label: `Status: ${stateLabel[state]}`, enabled: false },
      { label: `Hotkey: ${prettyAccelerator(hotkey.combo)}`, enabled: false },
      { label: `Mode: ${modeLabel[hotkey.mode]}`, enabled: false },
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

/** `Control+Command+Space` → `⌃ ⌘ Space` on macOS, `Ctrl + Alt + Space` elsewhere. */
function prettyAccelerator(combo: string): string {
  if (process.platform === 'darwin') {
    return combo
      .replace(/Control|Ctrl/g, '⌃')
      .replace(/Command|Cmd/g, '⌘')
      .replace(/Alt|Option/g, '⌥')
      .replace(/Shift/g, '⇧')
      .split('+')
      .join(' ');
  }
  return combo
    .replace(/Control/g, 'Ctrl')
    .split('+')
    .join(' + ');
}
