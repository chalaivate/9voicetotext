// Spec §8.2 audio configuration. Constraints picked for speech.
// Sprint 4b: device + sample rate are configurable via Settings.

export interface RecorderConfig {
  /** Empty string = system default microphone. */
  deviceId?: string;
  /** Capture sample rate. 16 kHz works best for Whisper. */
  sampleRate?: 16000 | 24000 | 48000;
}

const RECORDER_OPTIONS: MediaRecorderOptions = {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 32_000
};

function buildConstraints(cfg: RecorderConfig): MediaStreamConstraints {
  const audio: MediaTrackConstraints = {
    channelCount: 1,
    sampleRate: cfg.sampleRate ?? 16_000,
    sampleSize: 16,
    echoCancellation: true,
    noiseSuppression: true,
    // autoGainControl OFF on purpose (Sprint 4d Phase 4+). AGC ramps gain
    // up during silence, which (a) makes a muted/silent mic read as
    // moderate RMS — defeating the silent-audio short-circuit — and
    // (b) makes auto-stop's silence detection drift. gpt-4o-transcribe
    // handles un-normalized levels fine, so we trade level consistency
    // for a crisp silent-vs-speech RMS separation.
    autoGainControl: false
  };
  if (cfg.deviceId) {
    audio.deviceId = { exact: cfg.deviceId };
  }
  return { audio };
}

export interface RecordingHandle {
  /** Live analyser node — pull frequency/time-domain data for waveform UI. */
  analyser: AnalyserNode;
  stop(): Promise<{ data: ArrayBuffer; mimeType: string; durationMs: number }>;
  cancel(): void;
  /**
   * Sprint 4d Phase 4+ — max RMS observed during this recording. Used by
   * the renderer to skip sending audio to Whisper when the mic was muted
   * or the room was effectively silent (Whisper hallucinates from the
   * vocabulary prompt in that case). 0 if no samples were captured yet.
   */
  getMaxRms(): number;
}

export async function startRecording(cfg: RecorderConfig = {}): Promise<RecordingHandle> {
  const stream = await navigator.mediaDevices.getUserMedia(buildConstraints(cfg));

  // Some browsers/Electron builds reject our preferred mimeType — fall back to defaults.
  const options: MediaRecorderOptions = MediaRecorder.isTypeSupported(
    RECORDER_OPTIONS.mimeType ?? ''
  )
    ? RECORDER_OPTIONS
    : { audioBitsPerSecond: 32_000 };

  const recorder = new MediaRecorder(stream, options);
  const chunks: BlobPart[] = [];
  const startedAt = performance.now();

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  });

  recorder.start(250);

  // Build a parallel WebAudio graph from the same stream so we can render
  // a real-time waveform without disturbing the MediaRecorder pipeline.
  const audioContext = new (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  )();
  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.5;
  source.connect(analyser);

  let resolved = false;

  // Sprint 4d Phase 4+ — track loudest moment of the recording so we can
  // detect "mic was muted / silent room" before paying for a Whisper call
  // that will just hallucinate from the vocabulary prompt. Polled at 10 Hz
  // (matches SilenceDetector's cadence) which is plenty for capturing
  // peaks of human speech.
  let maxRms = 0;
  const rmsData = new Uint8Array(analyser.fftSize);
  const rmsPollHandle = window.setInterval(() => {
    analyser.getByteTimeDomainData(rmsData);
    let sumSq = 0;
    for (let i = 0; i < rmsData.length; i++) {
      const v = (rmsData[i]! - 128) / 128;
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / rmsData.length);
    if (rms > maxRms) maxRms = rms;
  }, 100);

  const releaseStream = (): void => {
    window.clearInterval(rmsPollHandle);
    stream.getTracks().forEach((t) => t.stop());
    try {
      source.disconnect();
      analyser.disconnect();
    } catch {
      // already disconnected — ignore
    }
    void audioContext.close();
  };

  const stop = (): Promise<{ data: ArrayBuffer; mimeType: string; durationMs: number }> =>
    new Promise((resolve, reject) => {
      if (resolved) {
        reject(new Error('recorder already stopped'));
        return;
      }
      recorder.addEventListener(
        'stop',
        async () => {
          resolved = true;
          try {
            const mimeType = recorder.mimeType || 'audio/webm';
            const blob = new Blob(chunks, { type: mimeType });
            const data = await blob.arrayBuffer();
            const durationMs = performance.now() - startedAt;
            releaseStream();
            resolve({ data, mimeType, durationMs });
          } catch (err) {
            releaseStream();
            reject(err);
          }
        },
        { once: true }
      );
      try {
        recorder.stop();
      } catch (err) {
        resolved = true;
        releaseStream();
        reject(err);
      }
    });

  const cancel = (): void => {
    if (resolved) return;
    resolved = true;
    try {
      recorder.stop();
    } catch {
      // ignore
    }
    releaseStream();
  };

  return { analyser, stop, cancel, getMaxRms: () => maxRms };
}
