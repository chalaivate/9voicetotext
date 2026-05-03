/**
 * uiohook-napi bridge — Sprint 4b push-to-talk support.
 *
 * Why this exists: Electron's `globalShortcut` only fires on key DOWN, never
 * key UP (spec §8.1). Push-to-talk needs both — start recording on press,
 * stop on release. We use `uiohook-napi` (libuiohook native module with
 * prebuilt binaries shipped for darwin-{arm64,x64} + win32-{arm64,x64}) to
 * listen system-wide for the release event.
 *
 * Lifecycle:
 *   - `loadUiohook()` lazily requires the module and returns null if the
 *     native binding fails to load. Toggle mode keeps working in that case.
 *   - `startUiohook()` starts the global listener (single instance).
 *   - `stopUiohook()` tears it down on app quit.
 *
 * macOS Accessibility permission is required for keyup events to actually
 * arrive. Without it the listener silently receives nothing — we warn the
 * user via the Hotkeys page if push-to-talk is enabled but we never see a
 * keyup within a few seconds of a known press.
 */
import { logger } from '@main/utils/logger';

type UiohookKeyboardEvent = {
  type: number;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  keycode: number;
};

interface UiohookModule {
  uIOhook: {
    on(event: 'keyup' | 'keydown', listener: (e: UiohookKeyboardEvent) => void): void;
    off?(event: 'keyup' | 'keydown', listener: (e: UiohookKeyboardEvent) => void): void;
    removeListener?(event: 'keyup' | 'keydown', listener: (e: UiohookKeyboardEvent) => void): void;
    start(): void;
    stop(): void;
  };
  UiohookKey: Record<string, number>;
}

let cached: UiohookModule | null | undefined;
let started = false;

function tryLoad(): UiohookModule | null {
  if (cached !== undefined) return cached;
  try {
    // Resolve at call time so vitest + main-process startup paths both behave.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('uiohook-napi') as UiohookModule;
    cached = mod;
    logger.info('uiohook-napi loaded');
    return mod;
  } catch (err) {
    cached = null;
    logger.warn('uiohook-napi unavailable — push-to-talk will be disabled', {
      error: (err as Error).message
    });
    return null;
  }
}

export function isAvailable(): boolean {
  return tryLoad() !== null;
}

export interface UiohookKeyboardListenerHandle {
  /** Stop listening; safe to call multiple times. */
  dispose(): void;
}

/**
 * Map an Electron accelerator key token to a uiohook keycode. We only
 * need the *main* key (modifiers we read off the event flags directly).
 */
export function acceleratorKeyToUiohookCode(key: string): number | null {
  const mod = tryLoad();
  if (!mod) return null;
  const k = key.trim();

  // Single character — letters and digits map by uppercase name
  if (k.length === 1) {
    const upper = k.toUpperCase();
    if (mod.UiohookKey[upper] !== undefined) return mod.UiohookKey[upper] ?? null;
  }

  // Direct name lookup (Space, F1, ArrowLeft, etc)
  if (mod.UiohookKey[k] !== undefined) return mod.UiohookKey[k] ?? null;

  // Common Electron → uiohook name aliases
  const aliases: Record<string, string> = {
    Esc: 'Escape',
    Return: 'Enter',
    Plus: 'Equal',
    ' ': 'Space',
    Up: 'ArrowUp',
    Down: 'ArrowDown',
    Left: 'ArrowLeft',
    Right: 'ArrowRight'
  };
  const aliased = aliases[k];
  if (aliased && mod.UiohookKey[aliased] !== undefined) {
    return mod.UiohookKey[aliased] ?? null;
  }

  return null;
}

/**
 * Listen for keyup of a specific key, regardless of modifier state. We don't
 * filter on modifiers because the user typically releases the main key first
 * but might keep the modifier held — and either ordering should stop the
 * recording. The hotkey's *press* is gated by `globalShortcut`, so by the
 * time we're listening the user has already pressed the full combo.
 */
export function onKeyup(uiohookCode: number, listener: () => void): UiohookKeyboardListenerHandle {
  const mod = tryLoad();
  if (!mod) {
    return { dispose: () => undefined };
  }

  const wrapped = (e: UiohookKeyboardEvent): void => {
    if (e.keycode === uiohookCode) {
      try {
        listener();
      } catch (err) {
        logger.error('uiohook keyup listener threw', { err: (err as Error).message });
      }
    }
  };

  mod.uIOhook.on('keyup', wrapped);

  return {
    dispose: () => {
      const off = mod.uIOhook.off ?? mod.uIOhook.removeListener;
      if (off) off.call(mod.uIOhook, 'keyup', wrapped);
    }
  };
}

export function startUiohook(): void {
  if (started) return;
  const mod = tryLoad();
  if (!mod) return;
  try {
    mod.uIOhook.start();
    started = true;
    logger.info('uiohook started');
  } catch (err) {
    logger.error('uiohook.start() failed', { err: (err as Error).message });
  }
}

export function stopUiohook(): void {
  if (!started) return;
  const mod = cached;
  if (!mod) return;
  try {
    mod.uIOhook.stop();
    started = false;
    logger.info('uiohook stopped');
  } catch (err) {
    logger.error('uiohook.stop() failed', { err: (err as Error).message });
  }
}
