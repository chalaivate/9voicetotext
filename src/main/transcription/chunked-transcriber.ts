import type { WhisperClient } from './whisper-client';
import { logger } from '@main/utils/logger';

/**
 * Sprint 4d Phase 4 — chunked live streaming transcription orchestrator.
 *
 * Receives audio chunks from the renderer one at a time, transcribes each
 * with the Whisper API, and accumulates the running text. The previous
 * chunk's text is fed back as Whisper's `prompt` parameter — combined
 * with the user's vocabulary prompt — so Whisper sees sentence context
 * across chunk boundaries and handles word-cut artifacts at the seams.
 *
 * Lifecycle:
 *   - `startSession()` — clears state for a fresh recording.
 *   - `submit(payload)` — transcribes one chunk; emits `onInterimUpdate`
 *     with the running text after each successful chunk.
 *   - On `isFinal=true`, after appending the last chunk, emits
 *     `onFinal(text)` with the full transcription.
 *
 * Failure handling: a single chunk failing (e.g. transient 500) does NOT
 * abort the session. We log + skip + continue. Only if EVERY chunk fails
 * does `onFinal` resolve to empty (the controller then surfaces the
 * standard "Transcription returned empty text" error).
 *
 * Prompt budget: Whisper accepts up to ~244 tokens. We keep the most
 * recent ~200 tokens of accumulated text + leave headroom for the
 * vocabulary prompt to be merged in by the caller.
 */

export interface ChunkPayload {
  audio: Buffer;
  mimeType: string;
  index: number;
  isFinal: boolean;
  durationMs: number;
}

export interface ChunkedTranscriberDeps {
  whisper: WhisperClient;
  /** User vocabulary prompt — composed by caller (with custom terms). */
  getVocabularyPrompt: () => string;
  /** Target language (or undefined for auto-detect). */
  getLanguage?: () => 'th' | 'en' | undefined;
  /** Fired after each chunk is transcribed (or skipped due to error). */
  onInterimUpdate: (text: string) => void;
  /** Fired exactly once after the final chunk lands. */
  onFinal: (text: string, totalDurationMs: number) => void;
  /** Best-effort warning for chunk-level failures. */
  onChunkError?: (chunkIndex: number, err: Error) => void;
}

/**
 * Approximate token-count truncation. Whisper's tokenizer isn't exposed
 * in the API; we approximate 1 token ≈ 4 chars (mixed Thai/English) and
 * keep 200 tokens worth (~800 chars) of recent context so the vocab
 * prompt can fit alongside under the ~244 token total budget.
 */
const PROMPT_CONTEXT_CHARS = 800;

export function buildChunkPrompt(vocab: string, runningText: string): string {
  const trimmed = runningText.trim();
  if (!trimmed) return vocab;
  const tail =
    trimmed.length > PROMPT_CONTEXT_CHARS ? trimmed.slice(-PROMPT_CONTEXT_CHARS) : trimmed;
  // Order matters — vocabulary first so any token truncation by the API
  // happens at the (less critical) running-text tail. In practice both
  // fit under 244 tokens for typical sessions.
  return `${vocab} ${tail}`.trim();
}

export class ChunkedTranscriber {
  private runningText = '';
  private totalDurationMs = 0;
  private successCount = 0;
  private finalEmitted = false;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ChunkedTranscriberDeps) {}

  /** Reset state for a new recording session. Idempotent. */
  startSession(): void {
    this.runningText = '';
    this.totalDurationMs = 0;
    this.successCount = 0;
    this.finalEmitted = false;
    this.inFlight = Promise.resolve();
  }

  getRunningText(): string {
    return this.runningText;
  }

  /**
   * Submit one chunk. Chained internally so chunks are processed in
   * order — Whisper requests can race and arrive out of order otherwise,
   * which would scramble the running text.
   */
  submit(payload: ChunkPayload): Promise<void> {
    this.inFlight = this.inFlight.then(() => this.processChunk(payload));
    return this.inFlight;
  }

  private async processChunk(payload: ChunkPayload): Promise<void> {
    if (this.finalEmitted) {
      logger.warn('chunk arrived after final emitted, ignoring', {
        index: payload.index
      });
      return;
    }

    this.totalDurationMs += payload.durationMs;
    const vocab = this.deps.getVocabularyPrompt();
    const language = this.deps.getLanguage?.();
    const prompt = buildChunkPrompt(vocab, this.runningText);

    try {
      const result = await this.deps.whisper.transcribe({
        audio: payload.audio,
        mimeType: payload.mimeType,
        options: {
          prompt,
          ...(language ? { language } : {})
        }
      });
      const text = (result.text ?? '').trim();
      if (text) {
        // Insert a space at the boundary unless one of the sides already
        // has whitespace. Thai text often runs without spaces; we err on
        // the side of inserting one because joiners can be removed at
        // post-process time but missing-spaces are harder to fix.
        if (this.runningText && !/\s$/.test(this.runningText) && !/^\s/.test(text)) {
          this.runningText += ' ';
        }
        this.runningText += text;
        this.successCount++;
        this.deps.onInterimUpdate(this.runningText);
      } else {
        // Empty chunk text — likely silent stretch. Don't append, but do
        // refresh the UI so the user sees we're still alive.
        this.deps.onInterimUpdate(this.runningText);
      }
    } catch (err) {
      const error = err as Error;
      logger.warn('chunk transcription failed, skipping', {
        chunkIndex: payload.index,
        error: error.message
      });
      this.deps.onChunkError?.(payload.index, error);
      // Still refresh UI so the gap is visible (at minimum the timer keeps moving).
      this.deps.onInterimUpdate(this.runningText);
    }

    if (payload.isFinal) {
      this.finalEmitted = true;
      this.deps.onFinal(this.runningText, this.totalDurationMs);
    }
  }
}
