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

export function filterHallucinations(input: string): FilterResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { text: '', filtered: true, reason: 'empty' };
  }
  for (const { pattern, label } of HALLUCINATIONS) {
    if (pattern.test(trimmed)) {
      return { text: '', filtered: true, reason: label };
    }
  }
  return { text: input, filtered: false };
}

/** Test-only export for adding patterns at runtime in tests. */
export const __HALLUCINATION_PATTERNS_FOR_TEST = HALLUCINATIONS;
