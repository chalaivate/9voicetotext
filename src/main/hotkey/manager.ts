import { globalShortcut, powerMonitor } from 'electron';
import type { HotkeyMode } from '@shared/types';
import { logger } from '@main/utils/logger';
import { parseHotkey } from './parser';
import {
  acceleratorKeyToUiohookCode,
  isAvailable as uiohookAvailable,
  onKeyup,
  startUiohook,
  type UiohookKeyboardListenerHandle
} from './uiohook-bridge';

type Listener = () => void;

export interface HotkeyCheckResult {
  ok: boolean;
  accelerator?: string;
  message?: string;
}

export class HotkeyManager {
  private currentAccelerator: string | null = null;
  private currentCombo: string | null = null;
  private currentMode: HotkeyMode = 'toggle';
  private pressListeners: Listener[] = [];
  private releaseListeners: Listener[] = [];
  private uiohookHandle: UiohookKeyboardListenerHandle | null = null;

  register(combo: string, mode: HotkeyMode = 'toggle'): void {
    const parsed = parseHotkey(combo);
    this.unregister();

    const ok = globalShortcut.register(parsed.accelerator, () => {
      logger.debug('hotkey pressed', { accelerator: parsed.accelerator, mode });
      this.firePress();
    });

    if (!ok) {
      throw new Error(
        `Failed to register hotkey "${parsed.accelerator}". It may already be in use by another application.`
      );
    }

    this.currentAccelerator = parsed.accelerator;
    this.currentCombo = combo;
    this.currentMode = mode;
    logger.info('hotkey registered', { accelerator: parsed.accelerator, mode });

    // Push-to-talk needs a key-up listener; globalShortcut doesn't fire one.
    if (mode === 'push-to-talk') {
      const code = acceleratorKeyToUiohookCode(parsed.key);
      if (code === null) {
        logger.warn(
          'push-to-talk requested but uiohook could not map the key — falling back to toggle behavior',
          { key: parsed.key, uiohookAvailable: uiohookAvailable() }
        );
      } else {
        startUiohook();
        this.uiohookHandle = onKeyup(code, () => {
          logger.debug('hotkey released (uiohook)', { accelerator: parsed.accelerator });
          this.fireRelease();
        });
      }
    }

    // Re-register on OS wake (Section 4.2 reliability requirement).
    powerMonitor.on('resume', this.handleResume);
  }

  unregister(): void {
    if (this.currentAccelerator) {
      globalShortcut.unregister(this.currentAccelerator);
      logger.info('hotkey unregistered', { accelerator: this.currentAccelerator });
      this.currentAccelerator = null;
      this.currentCombo = null;
    }
    if (this.uiohookHandle) {
      this.uiohookHandle.dispose();
      this.uiohookHandle = null;
    }
    powerMonitor.off('resume', this.handleResume);
  }

  isRegistered(): boolean {
    return this.currentAccelerator !== null;
  }

  getMode(): HotkeyMode {
    return this.currentMode;
  }

  /**
   * Test whether `combo` could be registered right now. Temporarily
   * unregisters our current hotkey, attempts the candidate, and restores.
   * Used by the Hotkeys settings page to surface conflicts before saving.
   */
  check(combo: string): HotkeyCheckResult {
    let parsed: ReturnType<typeof parseHotkey>;
    try {
      parsed = parseHotkey(combo);
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }

    const candidate = parsed.accelerator;

    // If it matches what we already have, it's trivially fine.
    if (candidate === this.currentAccelerator) {
      return { ok: true, accelerator: candidate };
    }

    // Temporarily release ours to do a clean test. We re-register at the
    // end regardless of test outcome.
    const restoreCombo = this.currentCombo;
    const restoreMode = this.currentMode;
    let weHadOne = false;
    if (this.currentAccelerator) {
      globalShortcut.unregister(this.currentAccelerator);
      this.currentAccelerator = null;
      weHadOne = true;
    }

    let ok = false;
    let message: string | undefined;

    try {
      if (globalShortcut.isRegistered(candidate)) {
        message = 'Another application has already claimed this shortcut.';
      } else {
        const registered = globalShortcut.register(candidate, () => undefined);
        if (registered) {
          ok = true;
          globalShortcut.unregister(candidate);
        } else {
          message = 'The OS refused to register this shortcut (likely already in use).';
        }
      }
    } catch (err) {
      message = (err as Error).message;
    }

    // Restore our hotkey if we had one.
    if (weHadOne && restoreCombo) {
      try {
        this.register(restoreCombo, restoreMode);
      } catch (err) {
        logger.error('failed to restore hotkey after check', {
          combo: restoreCombo,
          err: (err as Error).message
        });
      }
    }

    if (ok) return { ok: true, accelerator: candidate };
    return message ? { ok: false, message } : { ok: false };
  }

  onPress(listener: Listener): () => void {
    this.pressListeners.push(listener);
    return () => {
      this.pressListeners = this.pressListeners.filter((fn) => fn !== listener);
    };
  }

  onRelease(listener: Listener): () => void {
    this.releaseListeners.push(listener);
    return () => {
      this.releaseListeners = this.releaseListeners.filter((fn) => fn !== listener);
    };
  }

  private firePress(): void {
    for (const fn of this.pressListeners) {
      try {
        fn();
      } catch (err) {
        logger.error('hotkey press listener threw', { err });
      }
    }
  }

  private fireRelease(): void {
    for (const fn of this.releaseListeners) {
      try {
        fn();
      } catch (err) {
        logger.error('hotkey release listener threw', { err });
      }
    }
  }

  private handleResume = (): void => {
    if (!this.currentAccelerator || !this.currentCombo) return;
    const combo = this.currentCombo;
    const mode = this.currentMode;
    logger.info('system resumed, re-registering hotkey', {
      combo,
      mode
    });
    try {
      this.register(combo, mode);
    } catch (err) {
      logger.error('hotkey re-registration failed after resume', {
        combo,
        err: (err as Error).message
      });
    }
  };
}
