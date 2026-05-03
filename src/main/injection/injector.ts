import { logger } from '@main/utils/logger';
import { saveClipboard, restoreClipboard, writeText, type ClipboardSnapshot } from './clipboard';
import { createPasteRunner, KeystrokeError, type PasteRunner } from './keystroke';

export type InjectMode = 'paste' | 'clipboard' | 'both';

export interface InjectOptions {
  mode?: InjectMode;
  restoreClipboard?: boolean;
  /** ms between writing to clipboard and pressing paste. Default 50. */
  beforePasteMs?: number;
  /** ms between paste keystroke and clipboard restore. Default 150. */
  afterPasteMs?: number;
}

export interface InjectResult {
  ok: boolean;
  mode: InjectMode;
  /** Set when mode='paste'/'both' and the paste keystroke failed. */
  pasteError?: string;
  /** True when the original clipboard was successfully put back. */
  clipboardRestored: boolean;
}

export interface TextInjector {
  inject(text: string, options?: InjectOptions): Promise<InjectResult>;
}

export interface InjectorDeps {
  paste?: PasteRunner;
  /** Override the timer (for tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Override clipboard ops (for tests). */
  clipboardOps?: {
    save: () => ClipboardSnapshot;
    write: (text: string) => void;
    restore: (snap: ClipboardSnapshot) => void;
  };
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function createTextInjector(deps: InjectorDeps = {}): TextInjector {
  const paste = deps.paste ?? createPasteRunner();
  const sleep = deps.sleep ?? defaultSleep;
  const clip = deps.clipboardOps ?? {
    save: saveClipboard,
    write: writeText,
    restore: restoreClipboard
  };

  return {
    async inject(text, options = {}) {
      const mode: InjectMode = options.mode ?? 'paste';
      const shouldRestore = options.restoreClipboard ?? true;
      const beforePasteMs = options.beforePasteMs ?? 50;
      const afterPasteMs = options.afterPasteMs ?? 150;

      // Always start by snapshotting the clipboard so even on a
      // clipboard-only mode failure, we have an undo path.
      const snapshot = shouldRestore ? clip.save() : null;

      try {
        clip.write(text);

        if (mode === 'clipboard') {
          // Don't restore in clipboard-only mode — the user explicitly asked
          // us to leave the transcribed text on the clipboard for them.
          return {
            ok: true,
            mode,
            clipboardRestored: false
          };
        }

        // mode = 'paste' or 'both' — fire the keystroke
        await sleep(beforePasteMs);

        let pasteError: string | undefined;
        try {
          await paste.run();
        } catch (err) {
          if (err instanceof KeystrokeError) {
            pasteError = err.message;
          } else {
            pasteError = (err as Error).message;
          }
          logger.error('paste keystroke failed', { error: pasteError });
        }

        if (pasteError) {
          // Spec §8.4 edge case: some apps block programmatic paste. Don't
          // restore so the user can paste manually with Cmd+V themselves.
          return {
            ok: false,
            mode,
            pasteError,
            clipboardRestored: false
          };
        }

        await sleep(afterPasteMs);

        let clipboardRestored = false;
        if (mode === 'paste' && shouldRestore && snapshot) {
          try {
            clip.restore(snapshot);
            clipboardRestored = true;
          } catch (err) {
            logger.error('clipboard restore failed', {
              error: (err as Error).message
            });
          }
        }

        return { ok: true, mode, clipboardRestored };
      } catch (err) {
        // Catch-all for unexpected clipboard failures.
        logger.error('injector failed', { error: (err as Error).message });
        return {
          ok: false,
          mode,
          pasteError: (err as Error).message,
          clipboardRestored: false
        };
      }
    }
  };
}
