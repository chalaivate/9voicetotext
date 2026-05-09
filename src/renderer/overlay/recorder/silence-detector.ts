/**
 * Sprint 4d Phase 2 — Voice Activity Detection (VAD) for "Auto-stop" mode.
 *
 * Polls an RMS source every {@link SilenceDetectorOptions.pollMs} (default
 * 100ms) and fires {@link SilenceDetectorOptions.onSilenceTimeout} once the
 * RMS has stayed below {@link SilenceDetectorOptions.thresholdRms} for
 * {@link SilenceDetectorOptions.silenceDurationMs} continuously.
 *
 * Loud spikes reset the silence timer. We do NOT debounce loud→quiet
 * transitions: a single loud sample interrupts the entire countdown so a
 * cough or word break doesn't accidentally end the recording before the
 * configured grace period.
 *
 * The class is decoupled from `AnalyserNode` so tests can drive it with a
 * mock `rmsSource`. Use {@link rmsFromAnalyser} to wire one up against the
 * live audio graph in production.
 */

export interface SilenceDetectorUpdate {
  /** Most recent RMS sample [0,1]. */
  rms: number;
  /** ms of continuous silence so far. 0 if currently above threshold. */
  silentForMs: number;
  /** True when rms < threshold on the latest sample. */
  isSilent: boolean;
}

export interface SilenceDetectorOptions {
  /** Reads the latest RMS in [0,1]. Called every `pollMs`. */
  rmsSource: () => number;
  /** RMS below this is considered silence. */
  thresholdRms: number;
  /** ms of continuous silence required before {@link onSilenceTimeout} fires. */
  silenceDurationMs: number;
  /** Fired exactly once after silence persists for the full duration. */
  onSilenceTimeout: () => void;
  /** Optional progress hook — fires every poll. Useful for UI countdown. */
  onUpdate?: (update: SilenceDetectorUpdate) => void;
  /** Polling interval. Defaults to 100ms (10 Hz) — enough for human speech. */
  pollMs?: number;
  /**
   * Grace period after start during which silence does NOT count. Lets the
   * mic warm up + the user start speaking without instantly tripping the
   * detector. Default 500ms.
   */
  startupGraceMs?: number;
  /** Time provider — overrideable for fake-timer tests. */
  now?: () => number;
  /**
   * Timer factory — defaults to `setInterval`. Tests inject a manual driver
   * so polls happen synchronously without real time elapsing.
   */
  setIntervalFn?: (fn: () => void, ms: number) => () => void;
}

export class SilenceDetector {
  private cancelInterval: (() => void) | null = null;
  private silenceStartedAt: number | null = null;
  private fired = false;
  private startedAt = 0;
  private readonly opts: Required<
    Omit<SilenceDetectorOptions, 'onUpdate' | 'rmsSource' | 'onSilenceTimeout'>
  > & {
    rmsSource: SilenceDetectorOptions['rmsSource'];
    onSilenceTimeout: SilenceDetectorOptions['onSilenceTimeout'];
    onUpdate?: SilenceDetectorOptions['onUpdate'];
  };

  constructor(options: SilenceDetectorOptions) {
    this.opts = {
      rmsSource: options.rmsSource,
      thresholdRms: options.thresholdRms,
      silenceDurationMs: options.silenceDurationMs,
      onSilenceTimeout: options.onSilenceTimeout,
      onUpdate: options.onUpdate,
      pollMs: options.pollMs ?? 100,
      startupGraceMs: options.startupGraceMs ?? 500,
      now: options.now ?? (() => performance.now()),
      setIntervalFn:
        options.setIntervalFn ??
        ((fn, ms) => {
          const id = setInterval(fn, ms);
          return () => clearInterval(id);
        })
    };
  }

  /** Begin polling. Idempotent — calling twice has no extra effect. */
  start(): void {
    if (this.cancelInterval) return;
    this.startedAt = this.opts.now();
    this.silenceStartedAt = null;
    this.fired = false;
    this.cancelInterval = this.opts.setIntervalFn(this.tick, this.opts.pollMs);
  }

  /** Stop polling + reset state. Safe to call after dispose. */
  stop(): void {
    this.cancelInterval?.();
    this.cancelInterval = null;
    this.silenceStartedAt = null;
  }

  dispose(): void {
    this.stop();
  }

  private tick = (): void => {
    if (this.fired) return;
    const now = this.opts.now();
    const rms = this.opts.rmsSource();
    const isSilent = rms < this.opts.thresholdRms;

    // Honor startup grace — don't accumulate silence in the first N ms.
    if (now - this.startedAt < this.opts.startupGraceMs) {
      this.silenceStartedAt = null;
      this.opts.onUpdate?.({ rms, silentForMs: 0, isSilent });
      return;
    }

    if (isSilent) {
      if (this.silenceStartedAt === null) this.silenceStartedAt = now;
      const silentForMs = now - this.silenceStartedAt;
      this.opts.onUpdate?.({ rms, silentForMs, isSilent: true });
      if (silentForMs >= this.opts.silenceDurationMs) {
        this.fired = true;
        // Stop the interval BEFORE firing so the consumer's callback can
        // start a new recording without the old timer interfering.
        this.cancelInterval?.();
        this.cancelInterval = null;
        this.opts.onSilenceTimeout();
      }
    } else {
      this.silenceStartedAt = null;
      this.opts.onUpdate?.({ rms, silentForMs: 0, isSilent: false });
    }
  };
}

/**
 * Build an RMS reader from an AnalyserNode. Allocates the byte buffer once
 * and reuses it across polls. RMS uses time-domain (centered at 128) so we
 * capture amplitude regardless of frequency content.
 */
export function rmsFromAnalyser(analyser: AnalyserNode): () => number {
  const data = new Uint8Array(analyser.fftSize);
  return () => {
    analyser.getByteTimeDomainData(data);
    let sumSq = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i]! - 128) / 128;
      sumSq += v * v;
    }
    return Math.sqrt(sumSq / data.length);
  };
}
