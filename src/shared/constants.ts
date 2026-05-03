export const APP_NAME = '9VoiceToText';
export const APP_ID = 'com.9expert.voicetotext';

/**
 * Default hotkey. macOS gets Ctrl+Cmd+Space (per user request). On Windows
 * the `Command` key doesn't exist as an accelerator token, so we fall back
 * to `Ctrl+Alt+Space`. Sprint 4's settings UI lets the user remap either.
 *
 * Note: `Ctrl+Cmd+Space` on macOS is bound by default to the system Character
 * Picker. If `globalShortcut.register()` fails, the user must disable that
 * shortcut at System Settings → Keyboard → Keyboard Shortcuts → Input Sources.
 */
export const DEFAULT_HOTKEY =
  process.platform === 'darwin' ? 'Control+Command+Space' : 'Control+Alt+Space';

export const RECORDING = {
  maxDurationMs: 5 * 60 * 1000,
  /** Push-to-talk: shorter recordings than this are discarded as accidental taps. */
  minDurationMs: 200,
  sampleRate: 16_000,
  bitsPerSecond: 32_000,
  /** Whisper API hard limit for a single request. */
  maxBytes: 25 * 1024 * 1024
} as const;

export const TRANSCRIPTION = {
  apiUrl: 'https://api.openai.com/v1/audio/transcriptions',
  model: 'whisper-1',
  timeoutMs: 30_000,
  retryDelayMs: 2_000
} as const;

/**
 * Vocabulary presets — each chunk feeds the Whisper `prompt` parameter to
 * prime the model with proper nouns + technical terms it tends to mishear.
 *
 * Tuned from real Sprint 3 testing: Whisper Thai consistently misheard
 * `ทดสอบ` as `โทรศัพท์`, `ผลลัพธ์` as `ผลลับ`, `Claude Code` as `cross-code`,
 * `Google Keep` as `ฝั่งกูก็คิด`, and the user's name `ชไลเวท` as `ชะลายแวท`.
 *
 * Sprint 4b lets users toggle presets and add custom terms via the Settings UI.
 * Total composed prompt should stay under Whisper's 244-token limit.
 */
export const VOCABULARY_PRESETS = {
  coding:
    'Technical terms: TypeScript, JavaScript, React, Electron, function, component, async, await, useState, useEffect, npm, prompt, API, JSON, REST, async/await.',
  microsoft365:
    'Microsoft Word, Microsoft Excel, PowerPoint, Power BI, Power Automate, Microsoft 365, Copilot, AI Builder, Outlook.',
  brandNames:
    'Brand names: Claude Code, Cursor, VS Code, GitHub, Anthropic, OpenAI, Whisper, Notion, Slack, Google Keep, Google Docs, ChatGPT.',
  thai: 'ภาษาไทยศัพท์เทคนิค: ทดสอบ, ผลลัพธ์, ฟังก์ชัน, คอมโพเนนต์, แอปพลิเคชัน, การพัฒนา, ปรบมือ. Names: ชไลเวท, อ.เวท, 9Expert, 9Expert Training, 9VoiceToText. Thai-English mixed code-switching expected.'
} as const;

export type VocabularyPresetKey = keyof typeof VOCABULARY_PRESETS;

export interface VocabularyPresetFlags {
  coding: boolean;
  microsoft365: boolean;
  brandNames: boolean;
  thai: boolean;
}

/**
 * Compose the Whisper prompt from enabled presets + user custom terms.
 * Empty result falls back to the full coding+thai+brand prompt so we never
 * send Whisper an empty hint.
 */
export function composeWhisperPrompt(
  presets: VocabularyPresetFlags,
  customTerms: string[]
): string {
  const parts: string[] = [];
  if (presets.coding) parts.push(VOCABULARY_PRESETS.coding);
  if (presets.microsoft365) parts.push(VOCABULARY_PRESETS.microsoft365);
  if (presets.brandNames) parts.push(VOCABULARY_PRESETS.brandNames);
  if (presets.thai) parts.push(VOCABULARY_PRESETS.thai);
  const cleanedCustom = customTerms.map((t) => t.trim()).filter(Boolean);
  if (cleanedCustom.length > 0) parts.push(`Custom terms: ${cleanedCustom.join(', ')}.`);
  if (parts.length === 0) return DEFAULT_PROMPT_FALLBACK;
  return parts.join(' ');
}

const DEFAULT_PROMPT_FALLBACK = [
  VOCABULARY_PRESETS.coding,
  VOCABULARY_PRESETS.brandNames,
  VOCABULARY_PRESETS.thai
].join(' ');

/** Backward-compat for any consumer not yet migrated to composeWhisperPrompt. */
export const CODING_PROMPT = DEFAULT_PROMPT_FALLBACK;

export const OVERLAY = {
  width: 280,
  height: 80,
  /** Offset from screen edge, px. */
  edgeOffset: 20,
  /** Auto-hide delays after a terminal state. */
  successHideMs: 1_000,
  errorHideMs: 5_000
} as const;
