import { fetch, FormData, File } from 'undici';
import {
  CODING_PROMPT,
  DEFAULT_TRANSCRIPTION_MODEL,
  RECORDING,
  TRANSCRIPTION,
  type TranscriptionModelId
} from '@shared/constants';
import type { TranscribeResult } from '@shared/types';
import { logger } from '@main/utils/logger';
import { classifyHttp, WhisperError } from './errors';
import { withRetry } from './retry';

export interface TranscribeOptions {
  language?: 'th' | 'en';
  prompt?: string;
  temperature?: number;
  /** OpenAI transcription model id. Falls back to settings/default. */
  model?: TranscriptionModelId;
  signal?: AbortSignal;
}

export interface WhisperRequest {
  audio: Buffer;
  mimeType?: string;
  filename?: string;
  options?: TranscribeOptions;
}

export interface WhisperClient {
  transcribe(req: WhisperRequest): Promise<TranscribeResult>;
}

export type ApiKeyGetter = () => string | undefined | Promise<string | undefined | null>;

/**
 * Compose the Whisper `prompt` parameter from current settings each call.
 * Returning undefined / empty string falls back to {@link CODING_PROMPT}.
 */
export type PromptGetter = () => string | undefined;

export interface WhisperClientOptions {
  getApiKey: ApiKeyGetter;
  getPrompt?: PromptGetter;
  getLanguage?: () => 'th' | 'en' | undefined;
  /** Read the active transcription model id from settings. */
  getModel?: () => TranscriptionModelId | undefined;
}

export function createWhisperClient(opts: WhisperClientOptions | ApiKeyGetter): WhisperClient {
  const config: WhisperClientOptions = typeof opts === 'function' ? { getApiKey: opts } : opts;

  return {
    async transcribe(req: WhisperRequest): Promise<TranscribeResult> {
      const apiKey = await config.getApiKey();
      if (!apiKey) {
        throw new WhisperError('no-api-key', 'OpenAI API key is not configured.');
      }
      if (req.audio.byteLength > RECORDING.maxBytes) {
        throw new WhisperError(
          'audio-too-large',
          `Audio is ${(req.audio.byteLength / 1024 / 1024).toFixed(1)} MB; Whisper limit is 25 MB.`
        );
      }

      // Pull dynamic prompt + language + model each request so Settings
      // changes take effect without recreating the client.
      const dynamicPrompt = config.getPrompt?.();
      const dynamicLanguage = config.getLanguage?.();
      const dynamicModel = config.getModel?.();
      const mergedOptions: TranscribeOptions = {
        ...req.options,
        prompt: req.options?.prompt ?? dynamicPrompt ?? CODING_PROMPT,
        model: req.options?.model ?? dynamicModel ?? DEFAULT_TRANSCRIPTION_MODEL
      };
      const finalLanguage = req.options?.language ?? dynamicLanguage;
      if (finalLanguage) mergedOptions.language = finalLanguage;
      const reqWithDefaults: WhisperRequest = { ...req, options: mergedOptions };

      return withRetry(() => callWhisper(apiKey, reqWithDefaults));
    }
  };
}

async function callWhisper(apiKey: string, req: WhisperRequest): Promise<TranscribeResult> {
  const opts = req.options ?? {};
  const mime = req.mimeType ?? 'audio/webm';
  const filename = req.filename ?? 'audio.webm';

  const model = opts.model ?? TRANSCRIPTION.model;
  const form = new FormData();
  form.append('file', new File([req.audio], filename, { type: mime }));
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('temperature', String(opts.temperature ?? 0));
  if (opts.language) form.append('language', opts.language);
  form.append('prompt', opts.prompt ?? CODING_PROMPT);

  const localCtl = new AbortController();
  const timer = setTimeout(() => localCtl.abort(), TRANSCRIPTION.timeoutMs);
  const signal = opts.signal ?? localCtl.signal;
  if (opts.signal) opts.signal.addEventListener('abort', () => localCtl.abort());

  const startedAt = Date.now();
  try {
    const res = await fetch(TRANSCRIPTION.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      logger.warn('whisper http error', {
        status: res.status,
        retryAfter: res.headers.get('retry-after'),
        bodyPreview: bodyText.slice(0, 300)
      });
      throw classifyHttp(res.status, res.headers.get('retry-after') ?? undefined);
    }

    const json = (await res.json()) as TranscribeResult;
    const elapsedMs = Date.now() - startedAt;
    logger.info('whisper success', {
      model,
      elapsedMs,
      duration: json.duration,
      language: json.language,
      chars: json.text?.length ?? 0
    });
    return json;
  } catch (err) {
    if (err instanceof WhisperError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new WhisperError('timeout', 'Whisper request timed out.', { retryable: true });
    }
    throw new WhisperError('network', `Network error: ${(err as Error).message}`, {
      retryable: true
    });
  } finally {
    clearTimeout(timer);
  }
}
