// Spec §8.2 audio configuration. Constraints picked for speech (16 kHz mono).
const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: 1,
    sampleRate: 16_000,
    sampleSize: 16,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
};

const RECORDER_OPTIONS: MediaRecorderOptions = {
  mimeType: 'audio/webm;codecs=opus',
  audioBitsPerSecond: 32_000
};

export interface RecordingHandle {
  /** Live analyser node — pull frequency/time-domain data for waveform UI. */
  analyser: AnalyserNode;
  stop(): Promise<{ data: ArrayBuffer; mimeType: string; durationMs: number }>;
  cancel(): void;
}

export async function startRecording(): Promise<RecordingHandle> {
  const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);

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

  const releaseStream = (): void => {
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

  return { analyser, stop, cancel };
}
