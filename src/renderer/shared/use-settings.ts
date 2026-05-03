import { create } from 'zustand';
import type { SettingsShape, SettingsPatch } from '../../preload/api';
import { toast } from './components/Toast';

interface SettingsState {
  settings: SettingsShape | null;
  loaded: boolean;
  load(): Promise<void>;
  patch(p: SettingsPatch): Promise<void>;
  reset(): Promise<void>;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const PENDING: SettingsPatch[] = [];

/**
 * Spec §11.2: "Changes auto-save with 500ms debounce (toast notification)".
 * We accumulate patches and flush them all together to avoid stale-merge
 * races when several fields change in quick succession.
 */
function debouncedFlush(commit: (patch: SettingsPatch) => Promise<SettingsShape>): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (PENDING.length === 0) return;
    const merged = PENDING.reduce<SettingsPatch>((acc, p) => mergePatch(acc, p), {});
    PENDING.length = 0;
    try {
      await commit(merged);
      toast('Saved', 'success', 1200);
    } catch (err) {
      toast(`Save failed: ${(err as Error).message}`, 'error', 3000);
    }
  }, 500);
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  loaded: false,
  async load() {
    const s = await window.voiceToText.settings.get();
    set({ settings: s, loaded: true });
    // Subscribe to main → renderer broadcasts so we stay in sync if another
    // window or main-process logic mutates settings.
    window.voiceToText.settings.onChange((next) => {
      set({ settings: next });
    });
  },
  async patch(p) {
    const current = get().settings;
    if (!current) return;
    // Optimistic update: apply locally, queue debounced commit.
    set({ settings: applyPatch(current, p) });
    PENDING.push(p);
    debouncedFlush((merged) => window.voiceToText.settings.set(merged));
  },
  async reset() {
    const fresh = await window.voiceToText.settings.reset();
    set({ settings: fresh });
    toast('Settings reset', 'info');
  }
}));

function applyPatch(s: SettingsShape, p: SettingsPatch): SettingsShape {
  return {
    ...s,
    ...Object.fromEntries(
      Object.entries(p).map(([key, value]) => {
        const prev = s[key as keyof SettingsShape];
        return [key, isPlainObject(value) && isPlainObject(prev) ? { ...prev, ...value } : value];
      })
    )
  } as SettingsShape;
}

function mergePatch(a: SettingsPatch, b: SettingsPatch): SettingsPatch {
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const prev = out[key];
    out[key] = isPlainObject(value) && isPlainObject(prev) ? { ...prev, ...value } : value;
  }
  return out as SettingsPatch;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
