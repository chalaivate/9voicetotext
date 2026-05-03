import { describe, expect, it } from 'vitest';
import { composeWhisperPrompt, VOCABULARY_PRESETS } from '@shared/constants';

describe('composeWhisperPrompt', () => {
  it('joins enabled presets in deterministic order', () => {
    const result = composeWhisperPrompt(
      { coding: true, microsoft365: false, brandNames: true, thai: true },
      []
    );
    expect(result).toContain(VOCABULARY_PRESETS.coding);
    expect(result).toContain(VOCABULARY_PRESETS.brandNames);
    expect(result).toContain(VOCABULARY_PRESETS.thai);
    expect(result).not.toContain(VOCABULARY_PRESETS.microsoft365);
  });

  it('appends custom terms after the presets', () => {
    const result = composeWhisperPrompt(
      { coding: false, microsoft365: false, brandNames: false, thai: true },
      ['Glistening Muffin', 'ชาลัยเวท', 'foobar']
    );
    expect(result).toContain('Custom terms: Glistening Muffin, ชาลัยเวท, foobar.');
    // Should appear AFTER the Thai preset
    expect(result.indexOf(VOCABULARY_PRESETS.thai)).toBeLessThan(result.indexOf('Custom terms:'));
  });

  it('drops empty / whitespace-only custom terms', () => {
    const result = composeWhisperPrompt(
      { coding: true, microsoft365: false, brandNames: false, thai: false },
      ['  ', '', 'real-term', '   ']
    );
    expect(result).toContain('Custom terms: real-term.');
    expect(result).not.toContain(', ,');
  });

  it('falls back to a sensible default when nothing is enabled', () => {
    const result = composeWhisperPrompt(
      { coding: false, microsoft365: false, brandNames: false, thai: false },
      []
    );
    expect(result).toContain(VOCABULARY_PRESETS.coding);
    expect(result.length).toBeGreaterThan(0);
  });

  it('omits Custom terms section when there are no custom terms', () => {
    const result = composeWhisperPrompt(
      { coding: true, microsoft365: false, brandNames: false, thai: false },
      []
    );
    expect(result).not.toContain('Custom terms:');
  });

  it('all presets enabled stays under Whisper 244-token limit (rough)', () => {
    const result = composeWhisperPrompt(
      { coding: true, microsoft365: true, brandNames: true, thai: true },
      []
    );
    // ~4 chars per token is OpenAI's rule of thumb
    const approxTokens = Math.ceil(result.length / 4);
    expect(approxTokens).toBeLessThan(244);
  });
});
