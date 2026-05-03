import { describe, expect, it, vi } from 'vitest';
import { createTextInjector } from '@main/injection/injector';
import type { ClipboardSnapshot } from '@main/injection/clipboard';
import { KeystrokeError } from '@main/injection/keystroke';

const emptySnap: ClipboardSnapshot = { hadAnything: false };
const oldTextSnap: ClipboardSnapshot = { hadAnything: true, text: 'PREVIOUS' };

function makeMocks(snap: ClipboardSnapshot = oldTextSnap) {
  const save = vi.fn().mockReturnValue(snap);
  const write = vi.fn();
  const restore = vi.fn();
  const pasteRun = vi.fn().mockResolvedValue(undefined);
  const sleep = vi.fn().mockResolvedValue(undefined);
  return {
    save,
    write,
    restore,
    paste: { run: pasteRun },
    sleep
  };
}

describe('createTextInjector', () => {
  it('paste mode: saves clipboard, writes text, fires paste, restores clipboard', async () => {
    const mocks = makeMocks();
    const injector = createTextInjector({
      paste: mocks.paste,
      sleep: mocks.sleep,
      clipboardOps: { save: mocks.save, write: mocks.write, restore: mocks.restore }
    });

    const result = await injector.inject('hello world');

    expect(result.ok).toBe(true);
    expect(result.mode).toBe('paste');
    expect(result.clipboardRestored).toBe(true);
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.write).toHaveBeenCalledWith('hello world');
    expect(mocks.paste.run).toHaveBeenCalledOnce();
    expect(mocks.restore).toHaveBeenCalledWith(oldTextSnap);

    // Sleep is called twice: before paste (50ms) and after paste (150ms).
    expect(mocks.sleep).toHaveBeenCalledTimes(2);
    expect(mocks.sleep).toHaveBeenNthCalledWith(1, 50);
    expect(mocks.sleep).toHaveBeenNthCalledWith(2, 150);
  });

  it('clipboard mode: writes text without firing paste, never restores', async () => {
    const mocks = makeMocks();
    const injector = createTextInjector({
      paste: mocks.paste,
      sleep: mocks.sleep,
      clipboardOps: { save: mocks.save, write: mocks.write, restore: mocks.restore }
    });

    const result = await injector.inject('clipboard only', { mode: 'clipboard' });

    expect(result.ok).toBe(true);
    expect(result.clipboardRestored).toBe(false);
    expect(mocks.write).toHaveBeenCalledWith('clipboard only');
    expect(mocks.paste.run).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('paste failure: returns error and does NOT restore the clipboard', async () => {
    const mocks = makeMocks();
    mocks.paste.run.mockRejectedValueOnce(
      new KeystrokeError('osascript exited 1', 'darwin', 'permission denied')
    );

    const injector = createTextInjector({
      paste: mocks.paste,
      sleep: mocks.sleep,
      clipboardOps: { save: mocks.save, write: mocks.write, restore: mocks.restore }
    });

    const result = await injector.inject('blocked');

    expect(result.ok).toBe(false);
    expect(result.pasteError).toMatch(/osascript exited 1/);
    expect(result.clipboardRestored).toBe(false);
    expect(mocks.write).toHaveBeenCalledWith('blocked');
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('restoreClipboard=false: skips snapshot AND restore', async () => {
    const mocks = makeMocks();
    const injector = createTextInjector({
      paste: mocks.paste,
      sleep: mocks.sleep,
      clipboardOps: { save: mocks.save, write: mocks.write, restore: mocks.restore }
    });

    await injector.inject('no restore', { restoreClipboard: false });

    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it('respects custom delays', async () => {
    const mocks = makeMocks();
    const injector = createTextInjector({
      paste: mocks.paste,
      sleep: mocks.sleep,
      clipboardOps: { save: mocks.save, write: mocks.write, restore: mocks.restore }
    });

    await injector.inject('fast', { beforePasteMs: 10, afterPasteMs: 30 });

    expect(mocks.sleep).toHaveBeenNthCalledWith(1, 10);
    expect(mocks.sleep).toHaveBeenNthCalledWith(2, 30);
  });

  it('empty original clipboard: still ok, restore no-ops', async () => {
    const mocks = makeMocks(emptySnap);
    const injector = createTextInjector({
      paste: mocks.paste,
      sleep: mocks.sleep,
      clipboardOps: { save: mocks.save, write: mocks.write, restore: mocks.restore }
    });

    const result = await injector.inject('first thing');

    expect(result.ok).toBe(true);
    expect(mocks.restore).toHaveBeenCalledWith(emptySnap);
  });
});
