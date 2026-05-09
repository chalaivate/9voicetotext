import Store from 'electron-store';
import { z } from 'zod';
import { logger } from '@main/utils/logger';
import { DEFAULT_HOTKEY } from '@shared/constants';

/**
 * Spec §8.5 Settings schema, validated with zod. We default every field so
 * partial settings files (corrupt or pre-migration) parse cleanly.
 */
const HotkeyMode = z.enum(['push-to-talk', 'toggle']);
const SampleRate = z.union([z.literal(16_000), z.literal(24_000), z.literal(48_000)]);
const Provider = z.enum(['whisper-api', 'whisper-local']);
const TranscriptionModel = z.enum(['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe']);
const Language = z.enum(['auto', 'th', 'en']);
const OutputMode = z.enum(['paste', 'clipboard', 'both']);
const OverlayPosition = z.enum(['top-right', 'top-left', 'bottom-right', 'bottom-left']);
const Theme = z.enum(['system', 'light', 'dark']);

export const SettingsSchema = z
  .object({
    hotkey: z
      .object({
        combo: z.string().default(DEFAULT_HOTKEY),
        mode: HotkeyMode.default('toggle')
      })
      .default({ combo: DEFAULT_HOTKEY, mode: 'toggle' }),
    audio: z
      .object({
        inputDeviceId: z.string().default(''),
        sampleRate: SampleRate.default(16_000)
      })
      .default({ inputDeviceId: '', sampleRate: 16_000 }),
    transcription: z
      .object({
        provider: Provider.default('whisper-api'),
        /**
         * Sprint 4d Phase 1: choose between OpenAI transcription endpoints.
         * Default `gpt-4o-transcribe` — same price as `whisper-1` but
         * hallucinates significantly less based on production observations.
         */
        model: TranscriptionModel.default('gpt-4o-transcribe'),
        apiKeyRef: z.string().default(''),
        language: Language.default('auto'),
        customVocabulary: z.array(z.string()).default([]),
        vocabularyPresets: z
          .object({
            coding: z.boolean().default(true),
            microsoft365: z.boolean().default(false),
            brandNames: z.boolean().default(true),
            thai: z.boolean().default(true)
          })
          .default({ coding: true, microsoft365: false, brandNames: true, thai: true }),
        /**
         * §8.5 / Sprint 4b: filter known Whisper hallucinations
         * (e.g. "ขอบคุณที่รับชม" on silent recordings) before injection.
         */
        filterHallucinations: z.boolean().default(true),
        enablePostProcessing: z.boolean().default(false),
        postProcessPreset: z.string().default('default')
      })
      .default({
        provider: 'whisper-api',
        model: 'gpt-4o-transcribe',
        apiKeyRef: '',
        language: 'auto',
        customVocabulary: [],
        vocabularyPresets: { coding: true, microsoft365: false, brandNames: true, thai: true },
        filterHallucinations: true,
        enablePostProcessing: false,
        postProcessPreset: 'default'
      }),
    output: z
      .object({
        mode: OutputMode.default('paste'),
        restoreClipboard: z.boolean().default(true),
        pasteDelayMs: z.number().int().min(0).max(2_000).default(150)
      })
      .default({ mode: 'paste', restoreClipboard: true, pasteDelayMs: 150 }),
    ui: z
      .object({
        overlayPosition: OverlayPosition.default('top-right'),
        showWaveform: z.boolean().default(true),
        soundEnabled: z.boolean().default(true),
        soundVolume: z.number().int().min(0).max(100).default(30),
        theme: Theme.default('system')
      })
      .default({
        overlayPosition: 'top-right',
        showWaveform: true,
        soundEnabled: true,
        soundVolume: 30,
        theme: 'system'
      }),
    app: z
      .object({
        launchOnStartup: z.boolean().default(false),
        checkForUpdates: z.boolean().default(true),
        historyLimit: z.number().int().min(0).max(500).default(50)
      })
      .default({ launchOnStartup: false, checkForUpdates: true, historyLimit: 50 })
  })
  .default({});

export type Settings = z.infer<typeof SettingsSchema>;

/**
 * Schema version. Bumping this triggers `migrations[next]` in electron-store.
 * Keep migrations small + idempotent. v1 is the initial release.
 */
const SCHEMA_VERSION = 1;

let store: Store<{ settings: Settings; schemaVersion: number }> | null = null;

function getStore(): Store<{ settings: Settings; schemaVersion: number }> {
  if (store) return store;
  store = new Store<{ settings: Settings; schemaVersion: number }>({
    name: 'settings',
    defaults: {
      settings: SettingsSchema.parse({}),
      schemaVersion: SCHEMA_VERSION
    },
    // migrations are run in version order on read; v0 → v1 is a no-op for the
    // initial release. Future version bumps add entries here.
    migrations: {}
  });
  return store;
}

const listeners = new Set<(s: Settings) => void>();

export function getSettings(): Settings {
  // Re-parse on every read so a hand-edited JSON file with missing fields
  // gets backfilled with defaults instead of crashing the app.
  const raw = getStore().get('settings');
  const parsed = SettingsSchema.safeParse(raw);
  if (!parsed.success) {
    logger.warn('settings file failed schema validation, falling back to defaults', {
      issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
    });
    const fresh = SettingsSchema.parse({});
    getStore().set('settings', fresh);
    return fresh;
  }
  return parsed.data;
}

/** Returns the settings after the patch is applied. */
export function setSettings(patch: DeepPartial<Settings>): Settings {
  const current = getSettings();
  const merged = mergeDeep(current, patch);
  const parsed = SettingsSchema.safeParse(merged);
  if (!parsed.success) {
    throw new Error(
      `Invalid settings update: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`
    );
  }
  getStore().set('settings', parsed.data);
  notify(parsed.data);
  return parsed.data;
}

export function resetSettings(): Settings {
  const fresh = SettingsSchema.parse({});
  getStore().set('settings', fresh);
  notify(fresh);
  return fresh;
}

export function onSettingsChange(listener: (s: Settings) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(s: Settings): void {
  for (const fn of listeners) {
    try {
      fn(s);
    } catch (err) {
      logger.error('settings listener threw', { err: (err as Error).message });
    }
  }
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeDeep<T>(target: T, source: DeepPartial<T>): T {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return (source as T) ?? target;
  }
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    out[key] = isPlainObject(value)
      ? mergeDeep((target as Record<string, unknown>)[key], value as DeepPartial<unknown>)
      : value;
  }
  return out as T;
}
