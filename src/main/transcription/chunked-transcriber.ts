import type { WhisperClient } from './whisper-client';
import { logger } from '@main/utils/logger';
import { filterHallucinations } from './post-process';

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

/**
 * A whole chunk (≈5 s of audio) that transcribes to exactly one term from
 * the vocabulary prompt — "ชไลเวท", "9Expert", "Power BI" — is almost always
 * the model echoing the prompt over silence, not speech. The generic
 * prompt-echo filter has a 15-char floor to protect short real utterances
 * in the non-streaming path; for streaming chunks we can be stricter
 * because a real 5-second chunk carries far more than one word.
 */
export function isVocabularyTermEcho(text: string, vocab: string): boolean {
  const needle = text
    .trim()
    .toLowerCase()
    .replace(/^[\s.,;:!?"'()[\]]+|[\s.,;:!?"'()[\]]+$/g, '');
  if (!needle || needle.length > 40) return false;
  const terms = vocab
    .split(/[,;:.\n]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2);
  return terms.includes(needle);
}

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

/**
 * Whisper sometimes ECHOES the `prompt` parameter back at the start of its
 * output instead of using it as pure context. With chunked streaming this
 * shows up as duplicated text: chunk N's `prompt` includes chunk (N-1)'s
 * text, which then appears verbatim at the start of chunk N's transcription.
 * This helper trims the overlap before we append.
 *
 * Strategy: find the longest suffix of `running` that's also a prefix of
 * `chunk` (down to a minimum of 5 chars to avoid matching tiny common
 * fragments), then strip that prefix from the chunk. If the chunk is
 * entirely contained in the recent running text, drop it.
 *
 * Cap the search at the last 300 chars of `running` so the cost stays
 * O(1) regardless of session length.
 */
export function dedupeChunkOverlap(running: string, chunk: string): string {
  if (!running || !chunk) return chunk;
  // Normalize internal whitespace for comparison so "abc  def" matches
  // "abc def" — but we trim from the ORIGINAL chunk so we don't lose
  // any user-meaningful spacing.
  const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const normRun = normalize(running);
  const normChunk = normalize(chunk);
  if (!normRun || !normChunk) return chunk;
  // Pure-echo case: the entire chunk is contained in the tail of running.
  // Drop completely — Whisper produced no new content.
  const tailWindow = normRun.slice(-300);
  if (tailWindow.endsWith(normChunk)) {
    return '';
  }
  const maxOverlap = Math.min(tailWindow.length, normChunk.length, 200);
  const minOverlap = 5;
  for (let len = maxOverlap; len >= minOverlap; len--) {
    if (tailWindow.endsWith(normChunk.slice(0, len))) {
      // Trim `len` characters of meaningful content from the start of
      // the original chunk. Walk char-by-char skipping any leading
      // whitespace in the chunk so the count stays consistent with the
      // normalized comparison.
      return trimNormalizedPrefix(chunk, len);
    }
  }
  return chunk;
}

/**
 * Skip the first `nNormalizedChars` non-whitespace-collapsed characters
 * of `s`, then trim leading whitespace from what's left. Mirrors the
 * normalization used in {@link dedupeChunkOverlap} so an overlap match
 * found on normalized strings translates back to the original.
 */
function trimNormalizedPrefix(s: string, nNormalizedChars: number): string {
  let consumed = 0;
  let i = 0;
  let inWhitespaceRun = false;
  while (i < s.length && consumed < nNormalizedChars) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      if (!inWhitespaceRun && consumed > 0) {
        // A normalized space counts as one consumed char.
        consumed++;
        inWhitespaceRun = true;
      }
    } else {
      consumed++;
      inWhitespaceRun = false;
    }
    i++;
  }
  return s.slice(i).replace(/^\s+/, '');
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

    // Empty-audio marker: the renderer sends this when the trailing
    // chunk is too short or has no recorded data (e.g., user pressed
    // stop right after a rotation boundary, < 500ms of audio in the
    // new recorder). No Whisper call — just finalize so the controller
    // injects the accumulated text and unsticks the state machine.
    if (payload.audio.byteLength === 0) {
      logger.debug('empty-audio chunk marker received', {
        index: payload.index,
        isFinal: payload.isFinal
      });
      if (payload.isFinal) {
        this.finalEmitted = true;
        this.deps.onFinal(this.runningText, this.totalDurationMs);
      }
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
      let text = (result.text ?? '').trim();
      // Per-chunk hallucination guard. A quiet chunk makes the model
      // "transcribe" the vocabulary prompt instead (the user's own name,
      // brand names…). The non-streaming path already filters this on
      // the final text; streaming must do it per chunk or the echo shows
      // up live in the caption. Only the vocabulary prompt is used for
      // echo detection — the running-text part of the prompt is handled
      // by dedupeChunkOverlap below.
      if (text) {
        const guard = filterHallucinations(text, {
          audioDurationSec: payload.durationMs / 1000,
          whisperPrompt: vocab
        });
        const vocabEcho = !guard.filtered && isVocabularyTermEcho(text, vocab);
        if (guard.filtered || vocabEcho) {
          logger.info('streaming chunk filtered as hallucination', {
            index: payload.index,
            chars: text.length,
            reason: guard.filtered ? guard.reason : 'vocabulary-term-echo'
          });
          text = '';
        }
      }
      if (text) {
        // Whisper occasionally echoes the `prompt` parameter back at the
        // start of its output rather than treating it as pure context.
        // With chunk-N's prompt = chunk-(N-1)'s text, that produces
        // duplicated leading text. Strip the overlap before appending.
        const deduped = dedupeChunkOverlap(this.runningText, text);
        if (deduped) {
          // Insert a space at the boundary unless either side already
          // has whitespace OR the new chunk starts with a punctuation
          // mark that attaches to the previous word (".", "!", ",",
          // closing brackets, etc.). Thai text often runs without
          // spaces but punctuation rules are universal.
          const startsWithAttachingPunct = /^[.!?,;:)\]}»」』]/.test(deduped);
          if (
            this.runningText &&
            !/\s$/.test(this.runningText) &&
            !/^\s/.test(deduped) &&
            !startsWithAttachingPunct
          ) {
            this.runningText += ' ';
          }
          this.runningText += deduped;
          this.successCount++;
        } else {
          // Pure prompt-echo (no new content). Don't bump successCount
          // and don't append — but DO refresh the UI so the user sees
          // the "alive" signal that a chunk just landed.
          logger.debug('chunk was pure prompt-echo, dropped', { index: payload.index });
        }
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
