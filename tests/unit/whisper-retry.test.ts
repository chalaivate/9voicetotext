import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '@main/transcription/retry';
import { WhisperError } from '@main/transcription/errors';

describe('withRetry', () => {
  it('returns the result on the first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await withRetry(fn, { sleep });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries once on a retryable error and then succeeds', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        new WhisperError('server-error', 'oops', { status: 503, retryable: true })
      )
      .mockResolvedValue('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);
    const result = await withRetry(fn, { sleep, defaultDelayMs: 10 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(10);
  });

  it('honors retryAfterMs from rate-limit errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(
        new WhisperError('rate-limited', 'slow down', {
          status: 429,
          retryable: true,
          retryAfterMs: 7777
        })
      )
      .mockResolvedValue('ok');
    const sleep = vi.fn().mockResolvedValue(undefined);
    await withRetry(fn, { sleep, defaultDelayMs: 1 });
    expect(sleep).toHaveBeenCalledWith(7777);
  });

  it('does not retry non-retryable errors', async () => {
    const err = new WhisperError('invalid-api-key', 'bad key', { status: 401 });
    const fn = vi.fn().mockRejectedValue(err);
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(withRetry(fn, { sleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('caps at maxAttempts', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(
        new WhisperError('server-error', 'down', { status: 500, retryable: true })
      );
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(
      withRetry(fn, { sleep, defaultDelayMs: 1, maxAttempts: 2 })
    ).rejects.toBeInstanceOf(WhisperError);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
