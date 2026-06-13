import type { AppState, HotkeyMode, StateUpdate, TranscribeResult } from '@shared/types';
import { OVERLAY, RECORDING } from '@shared/constants';
import { logger } from '@main/utils/logger';
import { WhisperError } from '@main/transcription/errors';
import { userFacingMessage } from '@main/transcription/errors';
import type { WhisperClient } from '@main/transcription/whisper-client';
import type { InjectMode, TextInjector } from '@main/injection/injector';
import { filterHallucinations } from '@main/transcription/post-process';
import { ChunkedTranscriber } from '@main/transcription/chunked-transcriber';
import { AudioBuffer } from './audio-buffer';

export interface RecordingControllerDeps {
  whisper: WhisperClient;
  injector: TextInjector;
  /** Show the overlay window. Called when recording begins. */
  showOverlay: () => void;
  /** Hide the overlay window. Called after success/error auto-hide timer. */
  hideOverlay: () => void;
  /** Tell the overlay renderer to start its MediaRecorder. */
  requestRendererStart: () => void;
  /** Tell the overlay renderer to stop its MediaRecorder. */
  requestRendererStop: () => void;
  /** Broadcast the current state to overlay + tray. */
  broadcastState: (update: StateUpdate) => void;
  /** Read the current hotkey mode (toggle vs push-to-talk). */
  getHotkeyMode: () => HotkeyMode;
  /** Read whether to filter Whisper hallucinations. */
  getFilterHallucinations: () => boolean;
  /** Read the current Whisper prompt (for prompt-echo hallucination detection). */
  getWhisperPrompt?: () => string;
  /** Read the current output mode (paste vs clipboard-only). Defaults to 'paste'. */
  getOutputMode?: () => InjectMode;
  /** Sprint 4d Phase 4 — read whether streaming (chunked) mode is on. */
  getStreaming?: () => boolean;
  /** Read the active language for Whisper (or undefined for auto). */
  getLanguage?: () => 'th' | 'en' | undefined;
  /** Override timers (for tests). */
  setTimer?: (ms: number, fn: () => void) => () => void;
}

const realTimer = (ms: number, fn: () => void): (() => void) => {
  const handle = setTimeout(fn, ms);
  return () => clearTimeout(handle);
};

export class RecordingController {
  private state: AppState = 'idle';
  private buffer = new AudioBuffer();
  private cancelHideTimer: (() => void) | null = null;
  private cancelMaxDurationTimer: (() => void) | null = null;
  private recordingStartedAt = 0;
  /** Captured at `stop()` time. Fallback for filter's chars/sec heuristic when
   * the API response (gpt-4o-transcribe `json` format) doesn't include a
   * `duration` field. */
  private lastRecordingDurationMs = 0;
  /** Sprint 4d Phase 4 — chunked transcriber for streaming mode. Lazy. */
  private chunkedTranscriber: ChunkedTranscriber | null = null;
  /** Whether the current recording is using streaming mode. Captured at start(). */
  private streamingActive = false;
  private readonly setTimer: (ms: number, fn: () => void) => () => void;

  constructor(private readonly deps: RecordingControllerDeps) {
    this.setTimer = deps.setTimer ?? realTimer;
  }

  getState(): AppState {
    return this.state;
  }

  /**
   * Hotkey press entry point.
   *
   * - **toggle**: cycles start ↔ stop on each press.
   * - **push-to-talk**: fires on key DOWN to start recording; the matching
   *   release lives in {@link released}.
   * - **auto-stop** (Sprint 4d Phase 2): first press starts recording. The
   *   renderer's SilenceDetector triggers stop via the `recording:autoStop`
   *   IPC. A *second* press during recording **cancels** instead of stops —
   *   user override to abort without sending the audio. We pick cancel over
   *   stop so the user never accidentally transcribes a noise-induced false
   *   start; the silence timer is what's meant to send.
   */
  pressed(): void {
    const mode = this.deps.getHotkeyMode();
    if (mode === 'push-to-talk') {
      // First press of a recording session — only start when idle/done.
      if (this.state === 'idle' || this.state === 'success' || this.state === 'error') {
        this.start();
      } else {
        logger.debug('PTT press ignored — pipeline busy', { state: this.state });
      }
      return;
    }
    if (mode === 'auto-stop') {
      if (this.state === 'idle' || this.state === 'success' || this.state === 'error') {
        this.start();
      } else if (this.state === 'recording') {
        // Second press = cancel (NOT stop). See JSDoc above for rationale.
        logger.info('auto-stop cancelled by user re-press');
        this.cancel();
      } else {
        logger.debug('auto-stop press ignored — pipeline busy', { state: this.state });
      }
      return;
    }
    // Toggle mode
    if (this.state === 'idle' || this.state === 'success' || this.state === 'error') {
      this.start();
    } else if (this.state === 'recording') {
      this.stop();
    } else {
      logger.debug('hotkey ignored — pipeline busy', { state: this.state });
    }
  }

  /** Hotkey release entry point — only meaningful in push-to-talk mode. */
  released(): void {
    if (this.deps.getHotkeyMode() !== 'push-to-talk') return;
    if (this.state !== 'recording') return;

    const heldMs = Date.now() - this.recordingStartedAt;
    if (heldMs < RECORDING.minDurationMs) {
      logger.info('PTT tap below min duration — discarding', {
        heldMs,
        minDurationMs: RECORDING.minDurationMs
      });
      this.cancel();
      return;
    }
    this.stop();
  }

  /** @deprecated kept for tests; equivalent to {@link pressed}. */
  togglePressed(): void {
    this.pressed();
  }

  /**
   * Sprint 4d Phase 4+ — renderer detected the recording was effectively
   * silent (mic muted, or RMS never crossed the floor). Skip Whisper —
   * which would otherwise hallucinate text built from the vocabulary
   * prompt — and surface a friendly "check your mic" error. Only acted
   * on when we're actually mid-recording; stale events are ignored.
   */
  silentAudioDetected(maxRms: number): void {
    if (this.state !== 'recording' && this.state !== 'processing') {
      logger.debug('silentAudio ignored — not recording', {
        state: this.state,
        maxRms
      });
      return;
    }
    logger.info('silent audio detected, skipping Whisper', { maxRms });
    // Tear down any streaming session so a late chunk can't trigger an
    // injection after we've moved to error.
    this.cancelMaxDurationTimer?.();
    this.cancelMaxDurationTimer = null;
    if (this.streamingActive) {
      this.streamingActive = false;
      this.chunkedTranscriber = null;
    }
    this.buffer.clear();
    this.transitionToError('ไม่ได้ยินเสียง — ตรวจสอบไมค์ว่าเปิดอยู่และไม่ได้ mute ไว้นะครับ');
  }

  /**
   * Sprint 4d Phase 2 — fired by the renderer's SilenceDetector when RMS
   * drops below threshold for the configured duration. Same path as a
   * user-initiated stop, but only honored in auto-stop mode + while
   * recording (defensive: a stale event after cancel/stop is dropped).
   */
  autoStopFromSilence(): void {
    if (this.deps.getHotkeyMode() !== 'auto-stop') {
      logger.debug('autoStop ignored — not in auto-stop mode');
      return;
    }
    if (this.state !== 'recording') {
      logger.debug('autoStop ignored — not recording', { state: this.state });
      return;
    }
    logger.info('auto-stop fired by silence detector');
    this.stop();
  }

  /**
   * Submit the audio captured by the renderer's MediaRecorder, then run it
   * through Whisper.
   */
  async submitAudio(data: Uint8Array, mimeType: string): Promise<void> {
    if (this.state === 'idle') {
      // The renderer flushed audio after a cancel (e.g. PTT tap below
      // minDurationMs). Discard — there's nothing to transcribe.
      logger.debug('audio submitted post-cancel, discarding', { bytes: data.byteLength });
      return;
    }
    if (this.state !== 'processing') {
      logger.warn('audio submitted while not processing', { state: this.state });
    }
    this.buffer.set(data, mimeType);
    const taken = this.buffer.takeBuffer();
    if (!taken) {
      this.transitionToError('No audio data received from renderer.');
      return;
    }

    try {
      const result = await this.deps.whisper.transcribe({
        audio: taken.audio,
        mimeType: taken.mimeType
      });
      await this.handleResult(result);
    } catch (err) {
      const message =
        err instanceof WhisperError
          ? userFacingMessage(err)
          : `Transcription failed: ${(err as Error).message}`;
      logger.error('transcription failed', {
        kind: err instanceof WhisperError ? err.kind : 'unknown',
        message
      });
      this.transitionToError(message);
    }
  }

  cancel(): void {
    const wasRecording = this.state === 'recording';
    logger.info('recording cancelled', { state: this.state });
    this.clearTimers();
    this.buffer.clear();
    // Streaming mode: discard the in-progress transcriber session and
    // any chunks that arrive late.
    if (this.streamingActive) {
      this.streamingActive = false;
      // Reset the transcriber to drop any queued work; it will be
      // re-initialized on the next start().
      this.chunkedTranscriber = null;
    }
    // Tell the renderer to stop its MediaRecorder + release the mic stream
    // so the OS mic indicator turns off. Without this the stream leaks and
    // the orange dot in the macOS menu bar stays on indefinitely.
    if (wasRecording) {
      this.deps.requestRendererStop();
    }
    this.transition({ state: 'idle' });
    this.deps.hideOverlay();
  }

  private start(): void {
    if (this.state === 'success' || this.state === 'error') {
      this.clearHideTimer();
    }
    this.recordingStartedAt = Date.now();
    // Sprint 4d Phase 4 — capture streaming mode at start so a settings
    // toggle mid-recording can't leave us with a half-streaming session.
    this.streamingActive = this.deps.getStreaming?.() ?? false;
    if (this.streamingActive) {
      this.ensureChunkedTranscriber().startSession();
    }
    this.deps.showOverlay();
    this.transition({ state: 'recording' });
    this.deps.requestRendererStart();

    this.cancelMaxDurationTimer = this.setTimer(RECORDING.maxDurationMs, () => {
      logger.warn('recording auto-stopped at max duration');
      if (this.state === 'recording') this.stop();
    });
  }

  private ensureChunkedTranscriber(): ChunkedTranscriber {
    if (this.chunkedTranscriber) return this.chunkedTranscriber;
    this.chunkedTranscriber = new ChunkedTranscriber({
      whisper: this.deps.whisper,
      getVocabularyPrompt: () => this.deps.getWhisperPrompt?.() ?? '',
      ...(this.deps.getLanguage ? { getLanguage: this.deps.getLanguage } : {}),
      onInterimUpdate: (text) => {
        // Only broadcast interim while we're still recording — once we
        // hit `processing` (final chunk) the transcriber finalizes via
        // onFinal anyway, and pushing extra interim updates after that
        // would race with the inject path.
        if (this.state === 'recording') {
          this.transition({ state: 'recording', interimText: text });
        }
      },
      onFinal: (text, totalDurationMs) => {
        this.lastRecordingDurationMs = totalDurationMs;
        // Replay through the same path as the non-streaming pipeline so
        // hallucination filtering + injection are identical.
        void this.handleResult({
          text,
          language: this.deps.getLanguage?.() ?? '',
          duration: totalDurationMs / 1000,
          segments: []
        });
      },
      onChunkError: (chunkIndex, err) => {
        logger.warn('chunk transcription error (continuing)', {
          chunkIndex,
          error: err.message
        });
      }
    });
    return this.chunkedTranscriber;
  }

  /**
   * Sprint 4d Phase 4 — accept one chunk from the renderer's
   * ChunkedRecorder. The chunked transcriber takes care of ordering,
   * prompt chaining, and the final hand-off to handleResult.
   */
  async submitChunk(payload: {
    data: Uint8Array;
    mimeType: string;
    index: number;
    isFinal: boolean;
    durationMs: number;
  }): Promise<void> {
    if (!this.streamingActive) {
      logger.warn('chunk arrived but streaming is not active', { index: payload.index });
      return;
    }
    if (this.state === 'idle') {
      // Renderer flushed a chunk after a cancel — discard.
      logger.debug('chunk arrived post-cancel, discarding', { index: payload.index });
      return;
    }
    // The final chunk transitions us into processing so the overlay can
    // show "transcribing…" while the last Whisper request resolves.
    if (payload.isFinal && this.state === 'recording') {
      const durationMs = Date.now() - this.recordingStartedAt;
      this.cancelMaxDurationTimer?.();
      this.cancelMaxDurationTimer = null;
      this.transition({ state: 'processing', durationMs });
    }
    const transcriber = this.ensureChunkedTranscriber();
    await transcriber.submit({
      audio: Buffer.from(payload.data),
      mimeType: payload.mimeType,
      index: payload.index,
      isFinal: payload.isFinal,
      durationMs: payload.durationMs
    });
  }

  private stop(): void {
    this.cancelMaxDurationTimer?.();
    this.cancelMaxDurationTimer = null;
    const durationMs = Date.now() - this.recordingStartedAt;
    this.lastRecordingDurationMs = durationMs;
    // In streaming mode the final chunk drives the processing transition
    // (it's the chunk's onFinal callback that runs handleResult). We
    // still tell the renderer to stop here — it will flush a trailing
    // chunk via submitChunk(isFinal=true). Don't transition state yet;
    // submitChunk will do it once the trailing chunk arrives.
    if (!this.streamingActive) {
      this.transition({ state: 'processing', durationMs });
    }
    this.deps.requestRendererStop();
  }

  private async handleResult(result: TranscribeResult): Promise<void> {
    let text = (result.text ?? '').trim();
    if (!text) {
      this.transitionToError('Transcription returned empty text.');
      return;
    }

    // Hallucination filter — drop common Whisper boilerplate ("ขอบคุณที่รับชม",
    // "Thanks for watching", lone "you", etc.) before pasting it into the
    // user's editor. Sprint 4b §FR-2.4.
    if (this.deps.getFilterHallucinations()) {
      // gpt-4o-transcribe (json format) doesn't return `duration`. Fall back
      // to our own measured recording duration so the chars/sec heuristic
      // still works.
      const audioDurationSec =
        result.duration && result.duration > 0
          ? result.duration
          : this.lastRecordingDurationMs / 1000;
      const filterOpts: { audioDurationSec?: number; whisperPrompt?: string } = {
        audioDurationSec
      };
      const promptText = this.deps.getWhisperPrompt?.();
      if (promptText) filterOpts.whisperPrompt = promptText;
      const filtered = filterHallucinations(text, filterOpts);
      if (filtered.filtered) {
        // Privacy: do NOT log the transcribed text itself — it can be real
        // user speech that a filter false-positived, and app.log persists
        // on disk in plaintext. The reason + length are enough to debug.
        logger.info('hallucination filtered', { chars: text.length, reason: filtered.reason });
        this.transitionToError(
          'Likely silence detected (Whisper hallucinated boilerplate). Try recording again.'
        );
        return;
      }
      text = filtered.text;
    }

    // Hide the overlay BEFORE pasting so it doesn't briefly steal focus
    // from the target app. The state machine still drives the tray icon.
    this.transition({ state: 'injecting', text });
    this.deps.hideOverlay();

    const mode = this.deps.getOutputMode?.() ?? 'paste';
    const injection = await this.deps.injector.inject(text, { mode });

    if (!injection.ok) {
      // Paste blocked / failed — show overlay again with the message and
      // leave the text on the clipboard so the user can paste manually.
      this.deps.showOverlay();
      this.transitionToError(
        injection.pasteError
          ? `Paste failed: ${injection.pasteError}. Text is on the clipboard.`
          : 'Paste failed. Text is on the clipboard.'
      );
      return;
    }

    // Show overlay again briefly with the success state. The success message
    // disappears after OVERLAY.successHideMs (1s).
    this.deps.showOverlay();
    this.transition({ state: 'success', text });
    this.scheduleAutoHide(OVERLAY.successHideMs);
  }

  private transitionToError(message: string): void {
    this.transition({ state: 'error', message });
    this.scheduleAutoHide(OVERLAY.errorHideMs);
  }

  private scheduleAutoHide(ms: number): void {
    this.clearHideTimer();
    this.cancelHideTimer = this.setTimer(ms, () => {
      this.cancelHideTimer = null;
      this.deps.hideOverlay();
      this.transition({ state: 'idle' });
    });
  }

  private clearHideTimer(): void {
    this.cancelHideTimer?.();
    this.cancelHideTimer = null;
  }

  private clearTimers(): void {
    this.clearHideTimer();
    this.cancelMaxDurationTimer?.();
    this.cancelMaxDurationTimer = null;
  }

  private transition(update: StateUpdate): void {
    this.state = update.state;
    logger.debug('state transition', update);
    this.deps.broadcastState(update);
  }
}
