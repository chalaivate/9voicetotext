export type AppState = 'idle' | 'recording' | 'processing' | 'injecting' | 'success' | 'error';

export type HotkeyMode = 'push-to-talk' | 'toggle' | 'auto-stop';

export interface StateUpdate {
  state: AppState;
  text?: string;
  message?: string;
  durationMs?: number;
  /**
   * Sprint 4d Phase 4 — interim text accumulating during a streaming
   * recording. Only populated while `state === 'recording'` (or transient
   * `processing` between chunks). The overlay shows this in muted style;
   * the final transcription replaces it once the user stops.
   */
  interimText?: string;
}

export interface TranscribeSegment {
  start: number;
  end: number;
  text: string;
  avg_logprob: number;
}

export interface TranscribeResult {
  text: string;
  language: string;
  duration: number;
  segments: TranscribeSegment[];
}

export type TranscribeErrorKind =
  | 'no-api-key'
  | 'invalid-api-key'
  | 'rate-limited'
  | 'server-error'
  | 'timeout'
  | 'audio-too-large'
  | 'bad-request'
  | 'network'
  | 'unknown';

export interface TranscribeErrorPayload {
  kind: TranscribeErrorKind;
  message: string;
  status?: number;
}

export type TranscribeResponse =
  | { ok: true; result: TranscribeResult }
  | { ok: false; error: TranscribeErrorPayload };

/**
 * One transcription kept by the History window. Entries live in memory by
 * default and are written to disk only when `app.persistHistory` is on.
 */
export interface HistoryEntry {
  /** Opaque unique id (monotonic, main-process generated). */
  id: string;
  /** Final text as injected / copied. */
  text: string;
  /** Unix epoch ms when the transcription completed. */
  createdAt: number;
  /** Recording length in ms, 0 when unknown. */
  durationMs: number;
  /** Where the text went: pasted at the cursor, or clipboard only. */
  output: 'paste' | 'clipboard' | 'both';
}
