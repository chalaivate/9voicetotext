import { describe, expect, it } from 'vitest';
import { SettingsSchema } from '@main/store/settings';

describe('SettingsSchema', () => {
  it('parses an empty object into a fully defaulted settings tree', () => {
    const parsed = SettingsSchema.parse({});
    expect(parsed.hotkey.mode).toBe('toggle');
    expect(parsed.audio.sampleRate).toBe(16_000);
    expect(parsed.audio.silenceThresholdRms).toBe(0.015);
    expect(parsed.audio.silenceDurationMs).toBe(10_000);
    expect(parsed.transcription.provider).toBe('whisper-api');
    expect(parsed.transcription.model).toBe('gpt-4o-transcribe');
    expect(parsed.transcription.language).toBe('auto');
    expect(parsed.transcription.filterHallucinations).toBe(true);
    expect(parsed.transcription.vocabularyPresets.coding).toBe(true);
    expect(parsed.transcription.vocabularyPresets.microsoft365).toBe(false);
    expect(parsed.transcription.vocabularyPresets.brandNames).toBe(true);
    expect(parsed.transcription.vocabularyPresets.thai).toBe(true);
    expect(parsed.output.mode).toBe('paste');
    expect(parsed.output.restoreClipboard).toBe(true);
    expect(parsed.ui.overlayPosition).toBe('top-right');
    expect(parsed.ui.soundVolume).toBe(30);
    expect(parsed.app.historyLimit).toBe(50);
    expect(parsed.app.launchOnStartup).toBe(false);
  });

  it('accepts all 3 supported transcription models', () => {
    for (const model of ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe']) {
      const parsed = SettingsSchema.parse({ transcription: { model } });
      expect(parsed.transcription.model).toBe(model);
    }
  });

  it('rejects unknown transcription models', () => {
    const result = SettingsSchema.safeParse({
      transcription: { model: 'gpt-5-transcribe' }
    });
    expect(result.success).toBe(false);
  });

  it('preserves user-set vocabulary preset toggles', () => {
    const parsed = SettingsSchema.parse({
      transcription: {
        vocabularyPresets: { coding: false, microsoft365: true },
        filterHallucinations: false
      }
    });
    expect(parsed.transcription.vocabularyPresets.coding).toBe(false);
    expect(parsed.transcription.vocabularyPresets.microsoft365).toBe(true);
    // Unspecified preset keys keep their defaults
    expect(parsed.transcription.vocabularyPresets.thai).toBe(true);
    expect(parsed.transcription.filterHallucinations).toBe(false);
  });

  it('preserves user-set values when parsing partial input', () => {
    const parsed = SettingsSchema.parse({
      ui: { soundVolume: 75, theme: 'dark' },
      app: { historyLimit: 100 }
    });
    expect(parsed.ui.soundVolume).toBe(75);
    expect(parsed.ui.theme).toBe('dark');
    expect(parsed.app.historyLimit).toBe(100);
    // unspecified fields still defaulted
    expect(parsed.ui.soundEnabled).toBe(true);
    expect(parsed.app.launchOnStartup).toBe(false);
  });

  it('rejects invalid sample rates', () => {
    const result = SettingsSchema.safeParse({ audio: { sampleRate: 22050 } });
    expect(result.success).toBe(false);
  });

  it('rejects out-of-range volume', () => {
    const overflow = SettingsSchema.safeParse({ ui: { soundVolume: 150 } });
    expect(overflow.success).toBe(false);
    const negative = SettingsSchema.safeParse({ ui: { soundVolume: -5 } });
    expect(negative.success).toBe(false);
  });

  it('rejects out-of-range history limit', () => {
    const overflow = SettingsSchema.safeParse({ app: { historyLimit: 1000 } });
    expect(overflow.success).toBe(false);
  });

  it('rejects unknown enum values', () => {
    const badProvider = SettingsSchema.safeParse({
      transcription: { provider: 'azure' }
    });
    expect(badProvider.success).toBe(false);
  });

  it("accepts 'auto-stop' as a valid hotkey mode", () => {
    const parsed = SettingsSchema.parse({ hotkey: { mode: 'auto-stop' } });
    expect(parsed.hotkey.mode).toBe('auto-stop');
  });

  it('rejects unknown hotkey modes', () => {
    const result = SettingsSchema.safeParse({ hotkey: { mode: 'voice-activated' } });
    expect(result.success).toBe(false);
  });

  it('streaming defaults to off + 5000ms chunk', () => {
    const parsed = SettingsSchema.parse({});
    expect(parsed.transcription.streaming).toBe(false);
    expect(parsed.transcription.streamingChunkMs).toBe(5_000);
  });

  it('rejects streamingChunkMs outside [2000, 15000]', () => {
    expect(SettingsSchema.safeParse({ transcription: { streamingChunkMs: 1_000 } }).success).toBe(
      false
    );
    expect(SettingsSchema.safeParse({ transcription: { streamingChunkMs: 20_000 } }).success).toBe(
      false
    );
    expect(SettingsSchema.safeParse({ transcription: { streamingChunkMs: 5_000 } }).success).toBe(
      true
    );
  });

  it('rejects out-of-range silence detection values', () => {
    expect(SettingsSchema.safeParse({ audio: { silenceThresholdRms: 2 } }).success).toBe(false);
    expect(SettingsSchema.safeParse({ audio: { silenceThresholdRms: -0.1 } }).success).toBe(false);
    expect(SettingsSchema.safeParse({ audio: { silenceDurationMs: 500 } }).success).toBe(false);
    expect(SettingsSchema.safeParse({ audio: { silenceDurationMs: 60_000 } }).success).toBe(false);
  });
});
