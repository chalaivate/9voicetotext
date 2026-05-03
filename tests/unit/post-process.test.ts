import { describe, expect, it } from 'vitest';
import { filterHallucinations } from '@main/transcription/post-process';

describe('filterHallucinations', () => {
  it('flags Thai YouTube end-card hallucinations', () => {
    expect(filterHallucinations('ขอบคุณที่รับชม').filtered).toBe(true);
    expect(filterHallucinations('ขอบคุณที่รับชมครับ').filtered).toBe(true);
    expect(filterHallucinations('ขอบคุณครับที่รับชม').filtered).toBe(true);
    expect(filterHallucinations('Subscribe และกดกระดิ่งแจ้งเตือน').filtered).toBe(true);
    expect(filterHallucinations('แล้วเจอกันใหม่ครับ').filtered).toBe(true);
  });

  it('flags English YouTube end-card hallucinations', () => {
    expect(filterHallucinations('Thanks for watching').filtered).toBe(true);
    expect(filterHallucinations('Thank you for watching!').filtered).toBe(true);
    expect(filterHallucinations('Please subscribe').filtered).toBe(true);
    expect(filterHallucinations("Don't forget to subscribe and like").filtered).toBe(true);
    expect(filterHallucinations('Bye!').filtered).toBe(true);
  });

  it('flags single-word silence hallucinations', () => {
    expect(filterHallucinations('you').filtered).toBe(true);
    expect(filterHallucinations('You.').filtered).toBe(true);
    expect(filterHallucinations('...').filtered).toBe(true);
    expect(filterHallucinations('   ').filtered).toBe(true);
  });

  it('passes real Thai-English transcripts through unchanged', () => {
    const real = 'สวัสดีครับ วันนี้ผมจะมาทดสอบ TypeScript กับ React';
    expect(filterHallucinations(real)).toEqual({ text: real, filtered: false });
  });

  it('passes a sentence that contains the hallucination phrase as a substring', () => {
    // We deliberately only match WHOLE-text hallucinations to avoid stripping
    // legitimate utterances that happen to mention "thank you for watching".
    const utterance = 'Yesterday I said thank you for watching the demo, did they reply?';
    expect(filterHallucinations(utterance).filtered).toBe(false);
  });

  it('reports the matched pattern label so we can debug', () => {
    const result = filterHallucinations('ขอบคุณที่รับชม');
    expect(result.reason).toMatch(/thai-thanks-for-watching/);
  });

  it('returns text unchanged in the happy path', () => {
    const input = 'function add(a, b) { return a + b; }';
    expect(filterHallucinations(input)).toEqual({ text: input, filtered: false });
  });

  it('treats whitespace-only input as filtered (empty)', () => {
    expect(filterHallucinations('  \n\t  ').filtered).toBe(true);
    expect(filterHallucinations('').filtered).toBe(true);
  });
});
