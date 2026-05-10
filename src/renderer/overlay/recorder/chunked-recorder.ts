/**
 * Sprint 4d Phase 4 — Chunked recorder for live streaming transcription.
 *
 * Records audio in fixed-time chunks (default 5s) by stopping and
 * restarting `MediaRecorder` each interval. Each restart produces a
 * complete WebM file with valid headers — required because Whisper API
 * rejects partial WebM blobs (which is what `recorder.start(timeslice)`
 * dataavailable events emit after the first one).
 *
 * Lifecycle:
 *   1. User presses hotkey → `start()` opens stream + spawns the first
 *      MediaRecorder.
 *   2. Every `chunkDurationMs` (default 5000) the recorder is stopped,
 *      its onstop fires, the resulting Blob is delivered via
 *      `onChunk(blob, index, isFinal=false)`, and a fresh recorder is
 *      started in the same gum stream. Gap is ~50-100ms per restart.
 *   3. User presses stop / silence detector triggers / max duration → we
 *      stop the *current* recorder, deliver the trailing chunk via
 *      `onChunk(blob, index, isFinal=true)`, then release the stream.
 *   4. `cancel()` discards everything and releases the stream.
 *
 * Trade-offs vs the original {@link startRecording}:
 *   - Pro: text appears every ~5-7s during a long recording (Whisper
 *     latency dominates the perceived gap).
 *   - Pro: graceful failure mode — a network glitch on chunk N doesn't
 *     lose the rest.
 *   - Con: tiny audio gaps between chunks (~50-100ms). Acceptable for
 *     speech; could lose a syllable on the boundary.
 *   - Con: more API calls — same total cost (audio duration-based) but
 *     more HTTP overhead.
 *
 * Word-boundary handling is delegated to `ChunkedTranscriber` in main:
 * each chunk is sent with the previous chunk's text as the Whisper
 * `prompt`, which gives Whisper the context to handle a word that was
 * cut in half across the boundary.
 */

export interface ChunkedRecorderConfig {
  deviceId?: string;
  sampleRate?: 16000 | 24000 | 48000;
  /** Target chunk size in ms. Default 5000. */
  chunkDurationMs?: number;
  /**
   * Skip the trailing chunk if it's shorter than this. Whisper API
   * rejects audio under ~100ms with a 400. Default 500ms.
   */
  minChunkDurationMs?: number;
}

export interface ChunkedRecorderHandle {
  /** Live analyser node — same role as the original recorder. */
  analyser: AnalyserNode;
  /** Stop after the next natural chunk boundary, then emit a final chunk. */
  stop(): Promise<void>;
  /** Discard all in-flight chunks and release the stream. */
  cancel(): void;
}

export interface ChunkPayload {
  data: ArrayBuffer;
  mimeType: string;
  index: number;
  isFinal: boolean;
  durationMs: number;
}

export interface ChunkedRecorderCallbacks {
  /** Fires once for each completed chunk including the final one. */
  onChunk: (payload: ChunkPayload) => void;
  /** Fires after the stream is fully released (final chunk delivered or cancelled). */
  onClose?: () => void;
  /** Non-fatal error — e.g. a single chunk failed to encode. */
  onError?: (err: Error) => void;
}

const RECORDER_OPTIONS: MediaRecorderOptions = {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 32_000
};

function buildConstraints(cfg: ChunkedRecorderConfig): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {
    channelCount: 1,
    sampleRate: cfg.sampleRate ?? 16_000,
    sampleSize: 16,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  };
  if (cfg.deviceId) {
    audio.deviceId = { exact: cfg.deviceId };
  }
  return { audio };
}

function pickRecorderOptions(): MediaRecorderOptions {
  return MediaRecorder.isTypeSupported(RECORDER_OPTIONS.mimeType ?? '')
    ? RECORDER_OPTIONS
    : { audioBitsPerSecond: 32_000 };
}

export async function startChunkedRecording(
  cfg: ChunkedRecorderConfig,
  cb: ChunkedRecorderCallbacks
): Promise<ChunkedRecorderHandle> {
  const stream = await navigator.mediaDevices.getUserMedia(buildConstraints(cfg));
  const recorderOptions = pickRecorderOptions();
  const chunkDurationMs = cfg.chunkDurationMs ?? 5_000;
  const minChunkDurationMs = cfg.minChunkDurationMs ?? 500;

  // Build the parallel WebAudio graph once for the whole session — the
  // analyser keeps reading from `stream` continuously even as we cycle
  // through MediaRecorder instances.
  const audioContext = new (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  )();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.5;
  source.connect(analyser);

  let chunkIndex = 0;
  let currentRecorder: MediaRecorder | null = null;
  let currentChunks: BlobPart[] = [];
  let currentStartedAt = 0;
  let rotationTimer: number | null = null;
  let stopRequested = false;
  let cancelled = false;
  let stopResolver: (() => void) | null = null;
  /**
   * Promise of the last chunk's `onstop` handler. Each restart awaits the
   * previous handler so we never have two recorders running in parallel.
   */
  let inFlight: Promise<void> = Promise.resolve();

  const releaseStream = (): void => {
    stream.getTracks().forEach((t) => t.stop());
    try {
      source.disconnect();
      analyser.disconnect();
    } catch {
      // already disconnected — ignore
    }
    void audioContext.close();
    cb.onClose?.();
  };

  const startNewRecorder = (): void => {
    if (cancelled || stopRequested) return;
    const recorder = new MediaRecorder(stream, recorderOptions);
    currentRecorder = recorder;
    currentChunks = [];
    currentStartedAt = performance.now();

    recorder.addEventListener('dataavailable', (e) => {
      if (e.data && e.data.size > 0) currentChunks.push(e.data);
    });

    recorder.addEventListener(
      'stop',
      () => {
        const durationMs = performance.now() - currentStartedAt;
        const myIndex = chunkIndex++;
        const isFinal = stopRequested || cancelled;
        const mimeType = recorder.mimeType || 'audio/webm';
        const chunks = currentChunks;
        currentChunks = [];
        currentRecorder = null;

        // Cancelled mid-rotation — discard and resolve any pending stop().
        if (cancelled) {
          if (stopResolver) {
            stopResolver();
            stopResolver = null;
          }
          return;
        }

        // Skip too-short trailing chunks. Whisper rejects audio < ~100ms;
        // the user's intent on a quick stop is captured in the previous
        // chunk anyway.
        const tooShort = isFinal && durationMs < minChunkDurationMs && myIndex > 0;

        if (!tooShort && chunks.length > 0) {
          try {
            void new Blob(chunks, { type: mimeType }).arrayBuffer().then((data) => {
              cb.onChunk({ data, mimeType, index: myIndex, isFinal, durationMs });
            });
          } catch (err) {
            cb.onError?.(err as Error);
          }
        }

        // If this was the final chunk, release the stream and resolve.
        if (isFinal) {
          releaseStream();
          if (stopResolver) {
            stopResolver();
            stopResolver = null;
          }
          return;
        }

        // Otherwise spin up the next recorder for the next interval.
        startNewRecorder();
        scheduleNextRotation();
      },
      { once: true }
    );

    try {
      recorder.start();
    } catch (err) {
      cb.onError?.(err as Error);
    }
  };

  const scheduleNextRotation = (): void => {
    if (rotationTimer !== null) {
      window.clearTimeout(rotationTimer);
      rotationTimer = null;
    }
    rotationTimer = window.setTimeout(() => {
      rotationTimer = null;
      const r = currentRecorder;
      if (!r || cancelled || stopRequested) return;
      // Snapshot the in-flight promise so callers awaiting stop() see all
      // chunks land before resolution.
      inFlight = inFlight.then(
        () =>
          new Promise<void>((resolve) => {
            const restartListener = (): void => {
              resolve();
            };
            // The 'stop' listener registered in startNewRecorder will run
            // first (it'll spawn the next recorder). Resolve afterwards.
            r.addEventListener('stop', restartListener, { once: true });
            try {
              r.stop();
            } catch (err) {
              cb.onError?.(err as Error);
              resolve();
            }
          })
      );
    }, chunkDurationMs);
  };

  const stop = (): Promise<void> => {
    if (cancelled) return Promise.resolve();
    if (stopRequested) return inFlight;
    stopRequested = true;
    if (rotationTimer !== null) {
      window.clearTimeout(rotationTimer);
      rotationTimer = null;
    }
    return new Promise<void>((resolve) => {
      stopResolver = resolve;
      const r = currentRecorder;
      if (!r) {
        // No active recorder (e.g. between rotations) — release immediately.
        releaseStream();
        resolve();
        stopResolver = null;
        return;
      }
      try {
        r.stop();
      } catch (err) {
        cb.onError?.(err as Error);
        releaseStream();
        resolve();
        stopResolver = null;
      }
    });
  };

  const cancel = (): void => {
    if (cancelled) return;
    cancelled = true;
    if (rotationTimer !== null) {
      window.clearTimeout(rotationTimer);
      rotationTimer = null;
    }
    const r = currentRecorder;
    if (r) {
      try {
        r.stop();
      } catch {
        // ignore
      }
    }
    releaseStream();
  };

  // Kick off the first chunk + schedule its rotation.
  startNewRecorder();
  scheduleNextRotation();

  return { analyser, stop, cancel };
}
