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

interface ControllerOptions {
  mode?: 'toggle' | 'push-to-talk' | 'auto-stop';
  filterHallucinations?: boolean;
  streaming?: boolean;
}

function makeController(opts: ControllerOptions = {}): {
  controller: RecordingController;
  mocks: Mocks;
} {
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
    getHotkeyMode: () => opts.mode ?? 'toggle',
    getFilterHallucinations: () => opts.filterHallucinations ?? false,
    getStreaming: () => opts.streaming ?? false,
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
    expect(mocks.injectorInject).toHaveBeenCalledWith(
      'สวัสดีครับ hello world',
      expect.objectContaining({ mode: 'paste' })
    );

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

  it('hallucination filter on: drops “ขอบคุณที่รับชม” and surfaces friendly error', async () => {
    const { controller, mocks } = makeController({ filterHallucinations: true });
    mocks.whisperTranscribe.mockResolvedValue({
      ...sampleResult,
      text: 'ขอบคุณที่รับชม'
    });
    controller.pressed();
    controller.pressed();
    await controller.submitAudio(new Uint8Array([1]), 'audio/webm');
    expect(controller.getState()).toBe('error');
    const errorCall = mocks.broadcastState.mock.calls.find(([u]) => u.state === 'error');
    expect(errorCall?.[0].message).toMatch(/silence/i);
    expect(mocks.injectorInject).not.toHaveBeenCalled();
  });

  it('hallucination filter off: pastes the boilerplate text unchanged', async () => {
    const { controller, mocks } = makeController({ filterHallucinations: false });
    mocks.whisperTranscribe.mockResolvedValue({
      ...sampleResult,
      text: 'Thanks for watching'
    });
    controller.pressed();
    controller.pressed();
    await controller.submitAudio(new Uint8Array([1]), 'audio/webm');
    expect(mocks.injectorInject).toHaveBeenCalledWith(
      'Thanks for watching',
      expect.objectContaining({ mode: 'paste' })
    );
  });

  it('push-to-talk: press starts, release stops, second press starts again', () => {
    const { controller } = makeController({ mode: 'push-to-talk' });
    controller.pressed();
    expect(controller.getState()).toBe('recording');
    // Force the recordingStartedAt to be > minDurationMs ago so released() doesn't cancel.
    // Easiest: cheat by waiting via vi clock — but we don't use fake timers here. Instead,
    // we directly verify that release with a short hold cancels (next test).
    // Manually advance the recordingStartedAt by mutating Date.now via spy:
    const now = Date.now() + 500;
    const spy = vi.spyOn(Date, 'now').mockReturnValue(now);
    controller.released();
    expect(controller.getState()).toBe('processing');
    spy.mockRestore();

    // After processing completes (we don't submit audio here), a second press
    // while busy is ignored.
    controller.pressed();
    expect(controller.getState()).toBe('processing');
  });

  it('push-to-talk: very short tap (< minDurationMs) is discarded', () => {
    const { controller, mocks } = makeController({ mode: 'push-to-talk' });
    controller.pressed();
    // released() called immediately — Date.now() - recordingStartedAt ~ 0
    controller.released();
    expect(controller.getState()).toBe('idle');
    // Even on cancel we MUST stop the renderer's MediaRecorder so the mic
    // stream is released and the macOS mic indicator turns off.
    expect(mocks.requestRendererStop).toHaveBeenCalledOnce();
    // No transcription pipeline runs
    expect(mocks.broadcastState).not.toHaveBeenCalledWith(
      expect.objectContaining({ state: 'processing' })
    );
  });

  it('post-cancel audio submission is discarded silently', async () => {
    const { controller, mocks } = makeController({ mode: 'push-to-talk' });
    controller.pressed();
    controller.released(); // tap → cancel → idle, but renderer might still flush
    await controller.submitAudio(new Uint8Array([1, 2, 3]), 'audio/webm');
    expect(mocks.whisperTranscribe).not.toHaveBeenCalled();
    expect(controller.getState()).toBe('idle');
  });

  it('push-to-talk: release is a no-op when not recording', () => {
    const { controller, mocks } = makeController({ mode: 'push-to-talk' });
    controller.released();
    expect(controller.getState()).toBe('idle');
    expect(mocks.requestRendererStop).not.toHaveBeenCalled();
  });

  it('push-to-talk: subsequent press while busy is debounced', () => {
    const { controller } = makeController({ mode: 'push-to-talk' });
    controller.pressed(); // recording
    const spy = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 500);
    controller.released(); // processing
    spy.mockRestore();
    controller.pressed(); // ignored
    expect(controller.getState()).toBe('processing');
  });

  // ----- Sprint 4d Phase 2 — Auto-stop mode -------------------------------

  it('auto-stop: press starts recording, autoStopFromSilence stops it', () => {
    const { controller, mocks } = makeController({ mode: 'auto-stop' });
    controller.pressed();
    expect(controller.getState()).toBe('recording');
    expect(mocks.requestRendererStart).toHaveBeenCalledOnce();
    controller.autoStopFromSilence();
    expect(controller.getState()).toBe('processing');
    expect(mocks.requestRendererStop).toHaveBeenCalledOnce();
  });

  it('auto-stop: re-press during recording cancels (does NOT send audio)', async () => {
    const { controller, mocks } = makeController({ mode: 'auto-stop' });
    controller.pressed(); // start recording
    controller.pressed(); // re-press → cancel
    expect(controller.getState()).toBe('idle');
    // Cancel must release the renderer's mic stream.
    expect(mocks.requestRendererStop).toHaveBeenCalledOnce();
    expect(mocks.hideOverlay).toHaveBeenCalled();
    // Audio that arrives after a cancel is silently discarded — no Whisper.
    await controller.submitAudio(new Uint8Array([1, 2, 3]), 'audio/webm');
    expect(mocks.whisperTranscribe).not.toHaveBeenCalled();
  });

  it('auto-stop: autoStopFromSilence is ignored when not in auto-stop mode', () => {
    const { controller } = makeController({ mode: 'toggle' });
    controller.pressed(); // recording
    controller.autoStopFromSilence(); // should be a no-op
    expect(controller.getState()).toBe('recording');
  });

  it('auto-stop: autoStopFromSilence is ignored when not currently recording', () => {
    const { controller } = makeController({ mode: 'auto-stop' });
    // idle state
    controller.autoStopFromSilence();
    expect(controller.getState()).toBe('idle');
  });

  it('auto-stop: full happy path — press, silence triggers send, success state', async () => {
    const { controller, mocks } = makeController({ mode: 'auto-stop' });
    mocks.whisperTranscribe.mockResolvedValue(sampleResult);
    controller.pressed();
    controller.autoStopFromSilence();
    await controller.submitAudio(new Uint8Array([1, 2]), 'audio/webm');
    expect(mocks.injectorInject).toHaveBeenCalledWith(
      'สวัสดีครับ hello world',
      expect.objectContaining({ mode: 'paste' })
    );
    expect(controller.getState()).toBe('success');
  });

  // ----- Sprint 4d Phase 4 — Streaming (chunked) mode --------------------

  it('streaming: chunks accumulate then final triggers inject', async () => {
    const { controller, mocks } = makeController({ streaming: true });
    mocks.whisperTranscribe
      .mockResolvedValueOnce({ ...sampleResult, text: 'hello' })
      .mockResolvedValueOnce({ ...sampleResult, text: 'world' });

    controller.pressed(); // start
    expect(controller.getState()).toBe('recording');

    await controller.submitChunk({
      data: new Uint8Array([1]),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });

    // Interim broadcast captured.
    const interimCalls = mocks.broadcastState.mock.calls.filter(
      ([u]) => u.state === 'recording' && u.interimText
    );
    expect(interimCalls.length).toBeGreaterThan(0);
    expect(interimCalls.at(-1)?.[0].interimText).toBe('hello');

    // Final chunk: transitions to processing then injects.
    await controller.submitChunk({
      data: new Uint8Array([2]),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: true,
      durationMs: 3000
    });

    expect(mocks.injectorInject).toHaveBeenCalledWith(
      'hello world',
      expect.objectContaining({ mode: 'paste' })
    );
    expect(controller.getState()).toBe('success');
  });

  it('streaming: cancel discards in-progress session and ignores late chunks', async () => {
    const { controller, mocks } = makeController({ streaming: true });
    mocks.whisperTranscribe.mockResolvedValue({ ...sampleResult, text: 'late' });

    controller.pressed();
    controller.cancel();
    expect(controller.getState()).toBe('idle');

    // Chunk arriving after cancel — should NOT call Whisper.
    await controller.submitChunk({
      data: new Uint8Array([1]),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: true,
      durationMs: 5000
    });
    expect(mocks.whisperTranscribe).not.toHaveBeenCalled();
    expect(mocks.injectorInject).not.toHaveBeenCalled();
  });

  it('streaming: chunk failure does not abort the session', async () => {
    const { controller, mocks } = makeController({ streaming: true });
    mocks.whisperTranscribe
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce({ ...sampleResult, text: 'recovered' });

    controller.pressed();
    await controller.submitChunk({
      data: new Uint8Array([1]),
      mimeType: 'audio/webm',
      index: 0,
      isFinal: false,
      durationMs: 5000
    });
    await controller.submitChunk({
      data: new Uint8Array([2]),
      mimeType: 'audio/webm',
      index: 1,
      isFinal: true,
      durationMs: 5000
    });

    expect(mocks.injectorInject).toHaveBeenCalledWith(
      'recovered',
      expect.objectContaining({ mode: 'paste' })
    );
  });
});
