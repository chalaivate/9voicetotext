/**
 * Whisper hallucination filter — Sprint 4b.
 *
 * Whisper-1 has a well-documented tendency to hallucinate phrases on silent
 * or near-silent audio. The model was trained heavily on YouTube transcripts,
 * so silent input often produces YouTube end-card boilerplate ("Thanks for
 * watching", "Subscribe และกดกระดิ่งแจ้งเตือน", "ขอบคุณที่รับชม", or just
 * "you" in English).
 *
 * Patterns are matched against the FULL trimmed transcript. If the entire
 * output matches one of these regexes, we discard it and surface a friendly
 * "likely silence — try again" error to the user instead of pasting the
 * hallucination.
 *
 * We deliberately do NOT do partial-sentence stripping in v1: the risk of
 * dropping a real sentence containing the substring (e.g. someone literally
 * saying "thank you for watching") outweighs the marginal benefit. Whole-text
 * match is conservative and safe.
 *
 * Add new entries when users report a hallucination they hit repeatedly.
 */

interface HallucinationPattern {
  pattern: RegExp;
  /** Human-readable label for logs. */
  label: string;
}

// Thai polite-particle suffix used at the end of phrases. Built as a
// non-capturing alternation so we don't run into ESLint's
// no-misleading-character-class warning on Thai combining vowels.
const THAI_SUFFIX = '(?:ครับ|ค่ะ|คะ|ค่า|จ้า|จ้ะ)?';

const HALLUCINATIONS: HallucinationPattern[] = [
  // Thai YouTube end-card variants
  {
    pattern: new RegExp(`^ขอบคุณที่รับชม${THAI_SUFFIX}[!.\\s]*$`, 'u'),
    label: 'thai-thanks-for-watching'
  },
  {
    pattern: new RegExp(`^ขอบคุณ${THAI_SUFFIX}ที่รับชม${THAI_SUFFIX}[!.\\s]*$`, 'u'),
    label: 'thai-thanks-for-watching-2'
  },
  {
    pattern: /^Subscribe\s+และกดกระดิ่งแจ้งเตือน[!.\s]*$/iu,
    label: 'thai-subscribe-bell'
  },
  { pattern: /^อย่าลืม\s*subscribe.*$/iu, label: 'thai-please-subscribe' },
  {
    pattern: new RegExp(`^แล้วเจอกัน(?:ใหม่)?${THAI_SUFFIX}[!.\\s]*$`, 'u'),
    label: 'thai-see-you-next-time'
  },

  // English YouTube end-card variants
  { pattern: /^thanks?\s*for\s*watching[!.\s]*$/i, label: 'en-thanks-for-watching' },
  { pattern: /^thank\s+you\s+for\s+watching[!.\s]*$/i, label: 'en-thank-you-for-watching' },
  { pattern: /^please\s+subscribe[!.\s]*$/i, label: 'en-please-subscribe' },
  { pattern: /^don'?t\s+forget\s+to\s+subscribe.*$/i, label: 'en-dont-forget-subscribe' },
  { pattern: /^bye+[!.\s]*$/i, label: 'en-bye' },

  // Whisper's "single word hallucination on silence" patterns
  { pattern: /^you[!.\s]*$/i, label: 'en-single-you' },
  { pattern: /^\.{1,3}$/i, label: 'just-dots' },
  { pattern: /^\s*$/i, label: 'whitespace-only' }
];

export interface FilterResult {
  text: string;
  filtered: boolean;
  /** Label of the matched pattern, when filtered. */
  reason?: string;
}

export interface FilterOptions {
  /** Audio duration in seconds, when known. Enables chars/sec heuristic. */
  audioDurationSec?: number;
  /**
   * The Whisper `prompt` we sent. Enables prompt-echo detection — when audio
   * is short/quiet Whisper sometimes returns a chunk of the prompt verbatim.
   */
  whisperPrompt?: string;
}

/** Normalize whitespace + remove leading/trailing punctuation for comparison. */
function normalizeForCompare(s: string): string {
  return s
    .trim()
    .replace(/^[\s.,;:!?]+/, '')
    .replace(/[\s.,;:!?]+$/, '')
    .replace(/\s+/g, ' ');
}

/**
 * Detect Whisper's "stuck loop" hallucination — when audio is silent or
 * unintelligible, Whisper echoes a phrase 3+ times back-to-back. We split
 * the output into whitespace-delimited tokens (Whisper adds spaces between
 * its repeated phrases, even for Thai) and look for any contiguous N-token
 * slice that repeats ≥3 times consecutively.
 *
 * Returns the matched phrase if detected, else null.
 */
function findRepeatedPhrase(text: string): string | null {
  // Split on whitespace AND common punctuation so trailing commas/periods
  // don't break repeat-detection of phrases like "X, X, X, X, X".
  const tokens = text
    .trim()
    .split(/[\s,.;!?]+/)
    .filter(Boolean);
  if (tokens.length < 3) return null;

  const minRepeats = 3;
  const minPhraseChars = 10; // skip too-short patterns ("test test test" is OK)
  const maxPatternLen = Math.min(8, Math.floor(tokens.length / minRepeats));

  for (let pat = 1; pat <= maxPatternLen; pat++) {
    for (let start = 0; start + pat * minRepeats <= tokens.length; start++) {
      const slice = tokens.slice(start, start + pat).join(' ');
      if (slice.length < minPhraseChars) continue;

      let repeats = 1;
      let pos = start + pat;
      while (pos + pat <= tokens.length) {
        const next = tokens.slice(pos, pos + pat).join(' ');
        if (next === slice) {
          repeats++;
          pos += pat;
        } else break;
      }
      if (repeats >= minRepeats) return slice;
    }
  }
  return null;
}

export function filterHallucinations(input: string, opts: FilterOptions = {}): FilterResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { text: '', filtered: true, reason: 'empty' };
  }

  // 1) Whole-text boilerplate match (Thai/English YouTube end cards, etc.)
  for (const { pattern, label } of HALLUCINATIONS) {
    if (pattern.test(trimmed)) {
      return { text: '', filtered: true, reason: label };
    }
  }

  // 2) Stuck-loop repetition — Whisper echoing a phrase 3+ times in a row.
  const repeated = findRepeatedPhrase(trimmed);
  if (repeated) {
    return { text: '', filtered: true, reason: `repeated-phrase:${repeated.slice(0, 24)}` };
  }

  // 3) Chars/sec heuristic — humans speak ≤ 20-25 chars/sec sustained.
  // 235 chars over 2.3s (real example) = 102 c/s = clearly hallucinated.
  if (opts.audioDurationSec && opts.audioDurationSec > 0.5) {
    const charsPerSec = trimmed.length / opts.audioDurationSec;
    if (charsPerSec > 25) {
      return {
        text: '',
        filtered: true,
        reason: `chars-per-sec-too-high:${charsPerSec.toFixed(1)}`
      };
    }
  }

  // 4) Prompt-echo — Whisper sometimes returns a verbatim chunk of the prompt
  // when the input audio is too quiet/short to transcribe. Anything ≥ 15 chars
  // that is fully contained in the prompt is treated as an echo. The 15-char
  // floor avoids false positives on legitimate single-word utterances ("Microsoft
  // Word", "TypeScript") that happen to appear in the prompt.
  if (opts.whisperPrompt && trimmed.length >= 15) {
    const haystack = normalizeForCompare(opts.whisperPrompt);
    const needle = normalizeForCompare(trimmed);
    if (needle.length >= 15 && haystack.includes(needle)) {
      return { text: '', filtered: true, reason: 'prompt-echo' };
    }
  }

  return { text: input, filtered: false };
}

/** Test-only export for adding patterns at runtime in tests. */
export const __HALLUCINATION_PATTERNS_FOR_TEST = HALLUCINATIONS;
