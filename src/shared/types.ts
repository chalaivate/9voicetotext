export type AppState = 'idle' | 'recording' | 'processing' | 'injecting' | 'success' | 'error';

export type HotkeyMode = 'push-to-talk' | 'toggle';

export interface StateUpdate {
  state: AppState;
  text?: string;
  message?: string;
  durationMs?: number;
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
