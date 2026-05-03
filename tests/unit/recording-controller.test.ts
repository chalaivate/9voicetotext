import { describe, expect, it, vi } from 'vitest';
import { RecordingController } from '@main/recording/controller';
import { WhisperError } from '@main/transcription/errors';
import type { TranscribeResult } from '@shared/types';

interface Mocks {
  whisperTranscribe: ReturnType<typeof vi.fn>;
  injectorInject: ReturnType<typeof vi.fn>;
  showOverlay: ReturnType<typeof vi.fn>;
  hideOverlay: ReturnType<typeof vi.fn>;
  requestRendererStart: ReturnType<typeof vi.fn>;
  requestRendererStop: ReturnType<typeof vi.fn>;
  broadcastState: ReturnType<typeof vi.fn>;
  fireTimer: () => void;
}

function makeController(): { controller: RecordingController; mocks: Mocks } {
  let timerFn: (() => void) | null = null;
  const fireTimer = (): void => {
    timerFn?.();
    timerFn = null;
  };
  const setTimer = (_ms: number, fn: () => void): (() => void) => {
    timerFn = fn;
    return () => {
      if (timerFn === fn) timerFn = null;
    };
  };

  const whisperTranscribe = vi.fn();
  const injectorInject = vi.fn().mockResolvedValue({
    ok: true,
    mode: 'paste',
    clipboardRestored: true
  });
  const showOverlay = vi.fn();
  const hideOverlay = vi.fn();
  const requestRendererStart = vi.fn();
  const requestRendererStop = vi.fn();
  const broadcastState = vi.fn();

  const controller = new RecordingController({
    whisper: { transcribe: whisperTranscribe },
    injector: { inject: injectorInject },
    showOverlay,
    hideOverlay,
    requestRendererStart,
    requestRendererStop,
    broadcastState,
    setTimer
  });

  return {
    controller,
    mocks: {
      whisperTranscribe,
      injectorInject,
      showOverlay,
      hideOverlay,
      requestRendererStart,
      requestRendererStop,
      broadcastState,
      fireTimer
    }
  };
}

const sampleResult: TranscribeResult = {
  text: '  สวัสดีครับ hello world ',
  language: 'th',
  duration: 1.2,
  segments: []
};

describe('RecordingController', () => {
  it('first hotkey press starts recording and shows overlay', () => {
    const { controller, mocks } = makeController();
    controller.togglePressed();
    expect(controller.getState()).toBe('recording');
    expect(mocks.showOverlay).toHaveBeenCalledOnce();
    expect(mocks.requestRendererStart).toHaveBeenCalledOnce();
    expect(mocks.broadcastState).toHaveBeenCalledWith({ state: 'recording' });
  });

  it('second press transitions to processing', () => {
    const { controller, mocks } = makeController();
    controller.togglePressed();
    controller.togglePressed();
    expect(controller.getState()).toBe('processing');
    expect(mocks.requestRendererStop).toHaveBeenCalledOnce();
  });

  it('happy path: trims whitespace, injects, broadcasts success, then auto-hides', async () => {
    const { controller, mocks } = makeController();
    mocks.whisperTranscribe.mockResolvedValue(sampleResult);
    controller.togglePressed();
    controller.togglePressed();
    await controller.submitAudio(new Uint8Array([0, 1, 2, 3]), 'audio/webm');

    expect(mocks.whisperTranscribe).toHaveBeenCalledOnce();
    expect(mocks.injectorInject).toHaveBeenCalledWith('สวัสดีครับ hello world');

    const injectingCall = mocks.broadcastState.mock.calls.find(([u]) => u.state === 'injecting');
    expect(injectingCall?.[0].text).toBe('สวัสดีครับ hello world');

    const successCall = mocks.broadcastState.mock.calls.find(([u]) => u.state === 'success');
    expect(successCall?.[0].text).toBe('สวัสดีครับ hello world');
    expect(controller.getState()).toBe('success');

    mocks.fireTimer();
    expect(mocks.hideOverlay).toHaveBeenCalled();
    expect(controller.getState()).toBe('idle');
  });

  it('paste failure: surfaces error message with the text-on-clipboard hint', async () => {
    const { controller, mocks } = makeController();
    mocks.whisperTranscribe.mockResolvedValue(sampleResult);
    mocks.injectorInject.mockResolvedValue({
      ok: false,
      mode: 'paste',
      pasteError: 'osascript exited 1',
      clipboardRestored: false
    });

    controller.togglePressed();
    controller.togglePressed();
    await controller.submitAudio(new Uint8Array([1]), 'audio/webm');

    const errorCall = mocks.broadcastState.mock.calls.find(([u]) => u.state === 'error');
    expect(errorCall?.[0].message).toMatch(/Paste failed.*Text is on the clipboard/);
    expect(controller.getState()).toBe('error');
  });

  it('whisper failure transitions to error with user-facing message', async () => {
    const { controller, mocks } = makeController();
    mocks.whisperTranscribe.mockRejectedValue(
      new WhisperError('invalid-api-key', 'bad', { status: 401 })
    );
    controller.togglePressed();
    controller.togglePressed();
    await controller.submitAudio(new Uint8Array([1, 2]), 'audio/webm');

    const errorCall = mocks.broadcastState.mock.calls.find(([u]) => u.state === 'error');
    expect(errorCall?.[0].message).toMatch(/API key/);
    expect(controller.getState()).toBe('error');
  });

  it('ignores hotkey presses while processing (debounce)', () => {
    const { controller } = makeController();
    controller.togglePressed(); // recording
    controller.togglePressed(); // processing
    controller.togglePressed(); // ignored
    expect(controller.getState()).toBe('processing');
  });

  it('empty transcription text is treated as an error', async () => {
    const { controller, mocks } = makeController();
    mocks.whisperTranscribe.mockResolvedValue({
      ...sampleResult,
      text: '   '
    });
    controller.togglePressed();
    controller.togglePressed();
    await controller.submitAudio(new Uint8Array([1]), 'audio/webm');
    expect(controller.getState()).toBe('error');
    expect(mocks.injectorInject).not.toHaveBeenCalled();
  });
});
