import type { AppState, StateUpdate, TranscribeResult } from '@shared/types';
import { OVERLAY, RECORDING } from '@shared/constants';
import { logger } from '@main/utils/logger';
import { WhisperError } from '@main/transcription/errors';
import { userFacingMessage } from '@main/transcription/errors';
import type { WhisperClient } from '@main/transcription/whisper-client';
import type { TextInjector } from '@main/injection/injector';
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
  private readonly setTimer: (ms: number, fn: () => void) => () => void;

  constructor(private readonly deps: RecordingControllerDeps) {
    this.setTimer = deps.setTimer ?? realTimer;
  }

  getState(): AppState {
    return this.state;
  }

  /**
   * Toggle entry point bound to the global hotkey. Starts a new recording when
   * idle, stops the current recording when recording, and ignores presses while
   * the pipeline is busy with a previous request.
   */
  togglePressed(): void {
    if (this.state === 'idle' || this.state === 'success' || this.state === 'error') {
      this.start();
    } else if (this.state === 'recording') {
      this.stop();
    } else {
      logger.debug('hotkey ignored — pipeline busy', { state: this.state });
    }
  }

  /**
   * Submit the audio captured by the renderer's MediaRecorder, then run it
   * through Whisper.
   */
  async submitAudio(data: Uint8Array, mimeType: string): Promise<void> {
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
    logger.info('recording cancelled', { state: this.state });
    this.clearTimers();
    this.buffer.clear();
    this.transition({ state: 'idle' });
    this.deps.hideOverlay();
  }

  private start(): void {
    if (this.state === 'success' || this.state === 'error') {
      this.clearHideTimer();
    }
    this.recordingStartedAt = Date.now();
    this.deps.showOverlay();
    this.transition({ state: 'recording' });
    this.deps.requestRendererStart();

    this.cancelMaxDurationTimer = this.setTimer(RECORDING.maxDurationMs, () => {
      logger.warn('recording auto-stopped at max duration');
      if (this.state === 'recording') this.stop();
    });
  }

  private stop(): void {
    this.cancelMaxDurationTimer?.();
    this.cancelMaxDurationTimer = null;
    const durationMs = Date.now() - this.recordingStartedAt;
    this.transition({ state: 'processing', durationMs });
    this.deps.requestRendererStop();
  }

  private async handleResult(result: TranscribeResult): Promise<void> {
    const text = (result.text ?? '').trim();
    if (!text) {
      this.transitionToError('Transcription returned empty text.');
      return;
    }

    // Hide the overlay BEFORE pasting so it doesn't briefly steal focus
    // from the target app. The state machine still drives the tray icon.
    this.transition({ state: 'injecting', text });
    this.deps.hideOverlay();

    const injection = await this.deps.injector.inject(text);

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
