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
 * Whisper `prompt` parameter — primes the model with proper nouns + technical
 * vocabulary it tends to mishear. Max 244 tokens; this string is ~200.
 *
 * Tuned from real Sprint 3 testing: Whisper Thai consistently misheard
 * `ทดสอบ` as `โทรศัพท์`, `ผลลัพธ์` as `ผลลับ`, `Claude Code` as `cross-code`,
 * `Google Keep` as `ฝั่งกูก็คิด`, and the user's name `ชาลัยเวท` as `ชะลายแวท`.
 * Listing them here forces Whisper's language model to expect the right words.
 *
 * Sprint 4 will let users edit/extend this via the Settings UI (FR-2.4).
 */
export const CODING_PROMPT = [
  'Technical terms: TypeScript, JavaScript, React, Electron, function, component,',
  'async, await, useState, useEffect, npm, prompt, API, JSON, REST, async/await.',
  'ภาษาไทยศัพท์เทคนิค: ทดสอบ, ผลลัพธ์, ฟังก์ชัน, คอมโพเนนต์, แอปพลิเคชัน, การพัฒนา, ปรบมือ.',
  'Brand names: Claude Code, Cursor, VS Code, GitHub, Anthropic, OpenAI, Whisper,',
  'Microsoft Word, Microsoft Excel, PowerPoint, Power BI, Power Automate, Microsoft 365,',
  'Copilot, AI Builder, Notion, Slack, Google Keep, Google Docs, ChatGPT, Outlook.',
  'Names: ชาลัยเวท, อ.เวท, 9Expert, 9Expert Training, 9VoiceToText.',
  'Thai-English mixed code-switching expected.'
].join(' ');

export const OVERLAY = {
  width: 280,
  height: 80,
  /** Offset from screen edge, px. */
  edgeOffset: 20,
  /** Auto-hide delays after a terminal state. */
  successHideMs: 1_000,
  errorHideMs: 5_000
} as const;
