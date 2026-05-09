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

  it('detects Whisper "stuck loop" — short phrase repeated 3+ times', () => {
    // Real example from production logs: Whisper echoes the prompt verbatim
    const stuck = 'ภาษาไทยศัพท์เทคนิค ภาษาไทยศัพท์เทคนิค ภาษาไทยศัพท์เทคนิค ภาษาไทยศัพท์เทคนิค';
    const r = filterHallucinations(stuck);
    expect(r.filtered).toBe(true);
    expect(r.reason).toMatch(/repeated-phrase/);
  });

  it('detects repetition with comma/space gaps between repeats', () => {
    const stuck = 'คอมโพเนนต์, แอปพลิเคชัน, คอมโพเนนต์, แอปพลิเคชัน, คอมโพเนนต์, แอปพลิเคชัน';
    expect(filterHallucinations(stuck).filtered).toBe(true);
  });

  it('does NOT flag legitimate text that happens to repeat one short word', () => {
    // "test test test" is 14 chars but each "test" is only 4 chars (below
    // minPhraseLen=10), so the loop detector should not trigger. The
    // sentence is also coherent.
    const ok = 'I will test test test the new feature in production today.';
    expect(filterHallucinations(ok).filtered).toBe(false);
  });

  it('flags suspiciously fast speech (chars/sec > 25)', () => {
    // No-space block won't trip the repetition detector → exercises chars/sec
    const ridiculous = 'a'.repeat(235);
    const r = filterHallucinations(ridiculous, { audioDurationSec: 2.3 });
    expect(r.filtered).toBe(true);
    expect(r.reason).toMatch(/chars-per-sec-too-high/);
  });

  it('does NOT flag normal speech rate (chars/sec ~ 15-20)', () => {
    const normal = 'สวัสดีครับ ผมกำลังทดสอบการบันทึกเสียง'; // ~38 chars
    const r = filterHallucinations(normal, { audioDurationSec: 2.5 }); // ~15 c/s
    expect(r.filtered).toBe(false);
  });

  it('skips chars/sec check when duration is unknown or near-zero', () => {
    // Long single token without repetition → only chars/sec heuristic could flag
    const longText = 'a'.repeat(200);
    expect(filterHallucinations(longText, { audioDurationSec: 0 }).filtered).toBe(false);
    expect(filterHallucinations(longText).filtered).toBe(false);
  });

  it('flags prompt-echo: output is verbatim chunk of the Whisper prompt', () => {
    const prompt =
      'Brand names: Claude Code, Cursor, GitHub. ภาษาไทยศัพท์เทคนิค: ทดสอบ, ฟังก์ชัน, คอมโพเนนต์. Names: ชไลเวท, อ.เวท.';
    // Real production case: user said "ชไลเวท" but Whisper echoed this prompt fragment
    const r = filterHallucinations('ภาษาไทยศัพท์เทคนิค', { whisperPrompt: prompt });
    expect(r.filtered).toBe(true);
    expect(r.reason).toBe('prompt-echo');
  });

  it('does NOT flag short single-word utterances even if they appear in prompt', () => {
    const prompt = 'Brand names: Microsoft Word, Microsoft Excel, Claude Code, GitHub.';
    // User legitimately said "Microsoft Word" — 14 chars, below 15-char floor
    const r = filterHallucinations('Microsoft Word', { whisperPrompt: prompt });
    expect(r.filtered).toBe(false);
  });

  it('does NOT flag normal speech that mentions a few prompt words', () => {
    const prompt = 'Technical terms: TypeScript, React, Electron, function, component.';
    const utterance = 'I am writing a React component using TypeScript today';
    const r = filterHallucinations(utterance, { whisperPrompt: prompt });
    expect(r.filtered).toBe(false);
  });

  it('strips trailing/leading whitespace + punctuation when comparing', () => {
    const prompt = 'ภาษาไทยศัพท์เทคนิค: ทดสอบ, ฟังก์ชัน, คอมโพเนนต์, แอปพลิเคชัน.';
    // Whisper sometimes adds trailing punctuation/whitespace not present in prompt
    const r = filterHallucinations('  ภาษาไทยศัพท์เทคนิค.  ', { whisperPrompt: prompt });
    expect(r.filtered).toBe(true);
    expect(r.reason).toBe('prompt-echo');
  });
});
