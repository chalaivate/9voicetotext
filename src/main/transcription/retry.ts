import { TRANSCRIPTION } from '@shared/constants';
import { logger } from '@main/utils/logger';
import { WhisperError } from './errors';

export interface RetryOptions {
  /** Total attempts including the first. Spec calls for 1 retry → maxAttempts = 2. */
  maxAttempts?: number;
  /** Delay used when the error doesn't carry a Retry-After hint. */
  defaultDelayMs?: number;
  /** Override the timer (for tests). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 2;
  const defaultDelayMs = opts.defaultDelayMs ?? TRANSCRIPTION.retryDelayMs;
  const sleep = opts.sleep ?? defaultSleep;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt >= maxAttempts;
      const retryable = err instanceof WhisperError && err.retryable;
      if (isLast || !retryable) {
        throw err;
      }
      const delay = err.retryAfterMs ?? defaultDelayMs;
      logger.warn('transcription retry scheduled', {
        attempt,
        kind: err.kind,
        delayMs: delay
      });
      await sleep(delay);
    }
  }
}
