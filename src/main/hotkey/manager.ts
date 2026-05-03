import { globalShortcut, powerMonitor } from 'electron';
import { logger } from '@main/utils/logger';
import { parseHotkey } from './parser';

type Listener = () => void;

export class HotkeyManager {
  private currentAccelerator: string | null = null;
  private pressListeners: Listener[] = [];

  register(combo: string): void {
    const parsed = parseHotkey(combo);
    this.unregister();

    const ok = globalShortcut.register(parsed.accelerator, () => {
      logger.debug('hotkey pressed', { accelerator: parsed.accelerator });
      for (const fn of this.pressListeners) {
        try {
          fn();
        } catch (err) {
          logger.error('hotkey listener threw', { err });
        }
      }
    });

    if (!ok) {
      throw new Error(
        `Failed to register hotkey "${parsed.accelerator}". It may already be in use by another application.`
      );
    }

    this.currentAccelerator = parsed.accelerator;
    logger.info('hotkey registered', { accelerator: parsed.accelerator });

    // Re-register on OS wake (Section 4.2 reliability requirement).
    powerMonitor.on('resume', this.handleResume);
  }

  unregister(): void {
    if (this.currentAccelerator) {
      globalShortcut.unregister(this.currentAccelerator);
      logger.info('hotkey unregistered', { accelerator: this.currentAccelerator });
      this.currentAccelerator = null;
    }
    powerMonitor.off('resume', this.handleResume);
  }

  isRegistered(): boolean {
    return this.currentAccelerator !== null;
  }

  onPress(listener: Listener): () => void {
    this.pressListeners.push(listener);
    return () => {
      this.pressListeners = this.pressListeners.filter((fn) => fn !== listener);
    };
  }

  private handleResume = (): void => {
    if (!this.currentAccelerator) return;
    const accel = this.currentAccelerator;
    logger.info('system resumed, re-registering hotkey', { accelerator: accel });
    globalShortcut.unregister(accel);
    const ok = globalShortcut.register(accel, () => {
      for (const fn of this.pressListeners) fn();
    });
    if (!ok) {
      logger.error('hotkey re-registration failed after resume', { accelerator: accel });
    }
  };
}
