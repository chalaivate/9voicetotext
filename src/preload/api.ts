import { ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type { StateUpdate } from '../shared/types';

type Unsubscribe = () => void;

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapper = (_event: unknown, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapper);
  return () => ipcRenderer.off(channel, wrapper);
}

// Mirror of Settings type from @main/store/settings.ts. Keeping a separate
// declaration here avoids dragging the full main-process module graph into
// the renderer.
export interface SettingsShape {
  hotkey: { combo: string; mode: 'push-to-talk' | 'toggle' };
  audio: { inputDeviceId: string; sampleRate: 16000 | 24000 | 48000 };
  transcription: {
    provider: 'whisper-api' | 'whisper-local';
    model: 'whisper-1' | 'gpt-4o-transcribe' | 'gpt-4o-mini-transcribe';
    apiKeyRef: string;
    language: 'auto' | 'th' | 'en';
    customVocabulary: string[];
    vocabularyPresets: {
      coding: boolean;
      microsoft365: boolean;
      brandNames: boolean;
      thai: boolean;
    };
    filterHallucinations: boolean;
    enablePostProcessing: boolean;
    postProcessPreset: string;
  };
  output: { mode: 'paste' | 'clipboard' | 'both'; restoreClipboard: boolean; pasteDelayMs: number };
  ui: {
    overlayPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
    showWaveform: boolean;
    soundEnabled: boolean;
    soundVolume: number;
    theme: 'system' | 'light' | 'dark';
  };
  app: { launchOnStartup: boolean; checkForUpdates: boolean; historyLimit: number };
}

export type SettingsPatch = {
  [K in keyof SettingsShape]?: Partial<SettingsShape[K]>;
};

export interface TestConnectionResult {
  ok: boolean;
  message: string;
}

export interface HotkeyCheckResult {
  ok: boolean;
  /** Normalized accelerator string when ok. */
  accelerator?: string;
  /** Reason for failure (parse error, conflict, etc). */
  message?: string;
}

export interface VoiceToTextApi {
  recording: {
    onStart(cb: () => void): Unsubscribe;
    onStop(cb: () => void): Unsubscribe;
    sendAudio(data: ArrayBuffer, mimeType: string): void;
    cancel(): void;
  };
  state: {
    onUpdate(cb: (update: StateUpdate) => void): Unsubscribe;
  };
  settings: {
    get(): Promise<SettingsShape>;
    set(patch: SettingsPatch): Promise<SettingsShape>;
    reset(): Promise<SettingsShape>;
    onChange(cb: (s: SettingsShape) => void): Unsubscribe;
  };
  secrets: {
    setApiKey(key: string): Promise<true>;
    hasApiKey(): Promise<boolean>;
    deleteApiKey(): Promise<true>;
    keyMask(): Promise<string>;
    testApiKey(): Promise<TestConnectionResult>;
  };
  hotkey: {
    check(combo: string): Promise<HotkeyCheckResult>;
  };
  vocabulary: {
    preview(): Promise<string>;
  };
  windows: {
    closeSelf(): void;
  };
}

export const api: VoiceToTextApi = {
  recording: {
    onStart: (cb) => subscribe<void>(IPC.recording.start, () => cb()),
    onStop: (cb) => subscribe<void>(IPC.recording.stop, () => cb()),
    sendAudio: (data, mimeType) => ipcRenderer.send(IPC.recording.audio, { data, mimeType }),
    cancel: () => ipcRenderer.send(IPC.recording.cancel)
  },
  state: {
    onUpdate: (cb) => subscribe<StateUpdate>(IPC.state.update, cb)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    set: (patch) => ipcRenderer.invoke(IPC.settings.set, patch),
    reset: () => ipcRenderer.invoke(IPC.settings.reset),
    onChange: (cb) => subscribe<SettingsShape>(IPC.settings.changed, cb)
  },
  secrets: {
    setApiKey: (key) => ipcRenderer.invoke(IPC.secrets.setApiKey, key),
    hasApiKey: () => ipcRenderer.invoke(IPC.secrets.hasApiKey),
    deleteApiKey: () => ipcRenderer.invoke(IPC.secrets.deleteApiKey),
    keyMask: () => ipcRenderer.invoke(IPC.secrets.keyMask),
    testApiKey: () => ipcRenderer.invoke(IPC.secrets.testApiKey)
  },
  hotkey: {
    check: (combo) => ipcRenderer.invoke(IPC.hotkey.check, combo)
  },
  vocabulary: {
    preview: () => ipcRenderer.invoke(IPC.vocabulary.preview)
  },
  windows: {
    closeSelf: () => ipcRenderer.send(IPC.windows.closeSelf)
  }
};
