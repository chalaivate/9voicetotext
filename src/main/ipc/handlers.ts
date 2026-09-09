import { app, ipcMain, BrowserWindow } from 'electron';
import { fetch } from 'undici';
import { IPC } from '@shared/ipc-channels';
import { APP_NAME, TRANSCRIPTION, composeWhisperPrompt } from '@shared/constants';
import { logger } from '@main/utils/logger';
import type { RecordingController } from '@main/recording/controller';
import type { HotkeyManager } from '@main/hotkey/manager';
import {
  getSettings,
  setSettings,
  resetSettings,
  onSettingsChange,
  type Settings
} from '@main/store/settings';
import { setApiKey, hasApiKey, deleteApiKey, getApiKey, maskKey } from '@main/store/secrets';
import type { SettingsWindow } from '@main/windows/settings';

interface IpcDeps {
  controller: RecordingController;
  settingsWindow: SettingsWindow;
  hotkey: HotkeyManager;
}

export function registerIpcHandlers({ controller, settingsWindow, hotkey }: IpcDeps): void {
  // ---- Recording (existing) ----------------------------------------------
  ipcMain.on(
    IPC.recording.audio,
    async (_event, payload: { data: ArrayBuffer; mimeType: string }) => {
      try {
        const bytes = new Uint8Array(payload.data);
        await controller.submitAudio(bytes, payload.mimeType ?? 'audio/webm');
      } catch (err) {
        logger.error('audio handler failed', { err: (err as Error).message });
      }
    }
  );

  ipcMain.on(IPC.recording.cancel, () => {
    controller.cancel();
  });

  // Sprint 4d Phase 2 — renderer's SilenceDetector hit the silence threshold
  // for the configured duration. Same outcome as a user-pressed stop, but
  // routed through a separate channel so we can debounce / log distinctly.
  ipcMain.on(IPC.recording.autoStop, () => {
    controller.autoStopFromSilence();
  });

  // Sprint 4d Phase 4+ — renderer detected the whole recording was
  // effectively silent (mic muted, etc). Skip Whisper and surface a
  // friendly "check your mic" error instead of letting Whisper
  // hallucinate from the vocabulary prompt.
  ipcMain.on(IPC.recording.silentAudio, (_event, payload: { maxRms?: number }) => {
    controller.silentAudioDetected(payload?.maxRms ?? 0);
  });

  // Sprint 4d Phase 4 — one chunk of audio in streaming mode. Controller
  // hands it off to the ChunkedTranscriber which transcribes + accumulates
  // and broadcasts interim updates back to the overlay.
  ipcMain.on(
    IPC.recording.chunk,
    async (
      _event,
      payload: {
        data: ArrayBuffer;
        mimeType: string;
        index: number;
        isFinal: boolean;
        durationMs: number;
      }
    ) => {
      try {
        await controller.submitChunk({
          data: new Uint8Array(payload.data),
          mimeType: payload.mimeType ?? 'audio/webm',
          index: payload.index,
          isFinal: !!payload.isFinal,
          durationMs: payload.durationMs ?? 0
        });
      } catch (err) {
        logger.error('chunk handler failed', {
          err: (err as Error).message,
          index: payload?.index
        });
      }
    }
  );

  // ---- App info (About page, diagnostics) --------------------------------
  // The sandboxed renderer has no `process`, so version/runtime facts must
  // come from main.
  ipcMain.handle(IPC.app.info, async () => ({
    name: APP_NAME,
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch
  }));

  // ---- Settings ----------------------------------------------------------
  ipcMain.handle(IPC.settings.get, async () => getSettings());

  ipcMain.handle(IPC.settings.set, async (_event, patch: unknown) => {
    if (typeof patch !== 'object' || patch === null) {
      throw new Error('settings:set requires an object payload');
    }
    return setSettings(patch as Partial<Settings>);
  });

  ipcMain.handle(IPC.settings.reset, async () => resetSettings());

  // Broadcast `settings:changed` whenever main mutates the store. Renderer
  // zustand bridges listen to this and refresh local state.
  onSettingsChange((s) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(IPC.settings.changed, s);
    }
  });

  // ---- Secrets (keytar) --------------------------------------------------
  ipcMain.handle(IPC.secrets.setApiKey, async (_event, key: unknown) => {
    if (typeof key !== 'string') throw new Error('secrets:setApiKey requires a string');
    await setApiKey(key);
    return true;
  });

  ipcMain.handle(IPC.secrets.hasApiKey, async () => hasApiKey());

  ipcMain.handle(IPC.secrets.deleteApiKey, async () => {
    await deleteApiKey();
    return true;
  });

  ipcMain.handle(IPC.secrets.keyMask, async () => maskKey(await getApiKey()));

  /**
   * Test the API key by hitting the OpenAI models endpoint. Cheap (no audio
   * upload) and returns a clear ok/fail. Spec §11.2 calls for a
   * "Test connection" button on the API key page.
   */
  ipcMain.handle(IPC.secrets.testApiKey, async () => {
    const key = await getApiKey();
    if (!key) {
      return { ok: false, message: 'No API key set yet.' };
    }
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TRANSCRIPTION.timeoutMs);
      const res = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: { Authorization: `Bearer ${key}` },
        signal: ctl.signal
      });
      clearTimeout(timer);
      if (res.status === 401) {
        return { ok: false, message: 'API key was rejected (401).' };
      }
      if (!res.ok) {
        return { ok: false, message: `OpenAI returned ${res.status}.` };
      }
      return { ok: true, message: 'Key is valid.' };
    } catch (err) {
      return {
        ok: false,
        message: `Network error: ${(err as Error).message || 'unknown'}`
      };
    }
  });

  // ---- Hotkey: validate a candidate combo without saving -----------------
  ipcMain.handle(IPC.hotkey.check, async (_event, combo: unknown) => {
    if (typeof combo !== 'string') {
      return { ok: false, message: 'Combo must be a string.' };
    }
    return hotkey.check(combo);
  });

  // ---- Vocabulary: compose preview of the prompt sent to Whisper ---------
  ipcMain.handle(IPC.vocabulary.preview, async () => {
    const s = getSettings();
    return composeWhisperPrompt(
      s.transcription.vocabularyPresets,
      s.transcription.customVocabulary
    );
  });

  // ---- Window open requests from renderer --------------------------------
  ipcMain.on(IPC.windows.openSettings, () => {
    settingsWindow.open();
  });

  ipcMain.on(IPC.windows.closeSelf, (event) => {
    const sender = BrowserWindow.fromWebContents(event.sender);
    sender?.close();
  });
}
