import type { TranscribeErrorKind, TranscribeErrorPayload } from '@shared/types';

export class WhisperError extends Error {
  readonly kind: TranscribeErrorKind;
  readonly status?: number;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;

  constructor(
    kind: TranscribeErrorKind,
    message: string,
    options: { status?: number; retryable?: boolean; retryAfterMs?: number } = {}
  ) {
    super(message);
    this.name = 'WhisperError';
    this.kind = kind;
    if (options.status !== undefined) this.status = options.status;
    this.retryable = options.retryable ?? false;
    if (options.retryAfterMs !== undefined) this.retryAfterMs = options.retryAfterMs;
  }

  toPayload(): TranscribeErrorPayload {
    const payload: TranscribeErrorPayload = {
      kind: this.kind,
      message: this.message
    };
    if (this.status !== undefined) payload.status = this.status;
    return payload;
  }
}

export function classifyHttp(status: number, retryAfterHeader?: string): WhisperError {
  if (status === 401) {
    return new WhisperError('invalid-api-key', 'Invalid OpenAI API key.', { status });
  }
  if (status === 400) {
    return new WhisperError('bad-request', 'Whisper rejected the request.', { status });
  }
  if (status === 429) {
    const retryAfterMs = parseRetryAfter(retryAfterHeader);
    return new WhisperError('rate-limited', 'OpenAI rate limit hit.', {
      status,
      retryable: true,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {})
    });
  }
  if (status >= 500 && status < 600) {
    return new WhisperError('server-error', `OpenAI server error (${status}).`, {
      status,
      retryable: true
    });
  }
  return new WhisperError('unknown', `Whisper request failed (${status}).`, { status });
}

function parseRetryAfter(header: string | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

export function userFacingMessage(err: WhisperError): string {
  switch (err.kind) {
    case 'no-api-key':
      return 'No API key set. Add OPENAI_API_KEY to .env.local.';
    case 'invalid-api-key':
      return 'OpenAI API key was rejected. Check it in .env.local.';
    case 'rate-limited':
      return 'OpenAI is rate-limiting. Try again in a moment.';
    case 'server-error':
      return 'OpenAI is having trouble. Please retry.';
    case 'timeout':
      return 'Transcription timed out (>30s).';
    case 'audio-too-large':
      return 'Recording is too long for one request (>25 MB).';
    case 'bad-request':
      return 'Whisper rejected the audio. Try a shorter clip.';
    case 'network':
      return 'Network error reaching OpenAI.';
    default:
      return err.message || 'Transcription failed.';
  }
}
