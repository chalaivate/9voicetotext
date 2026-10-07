import { app, dialog, nativeTheme } from 'electron';
import { APP_ID, APP_NAME, composeWhisperPrompt } from '@shared/constants';
import { IPC } from '@shared/ipc-channels';
import { logger } from '@main/utils/logger';
import { isMac } from '@main/utils/platform';
import { getEnv } from '@main/utils/env';
import { ensureSingleInstance } from '@main/app/single-instance';
import { setupLifecycle } from '@main/app/lifecycle';
import { checkChromiumResources } from '@main/app/integrity';
import { TrayManager } from '@main/tray/manager';
import { HotkeyManager } from '@main/hotkey/manager';
import { stopUiohook } from '@main/hotkey/uiohook-bridge';
import { OverlayWindow } from '@main/windows/overlay';
import { SettingsWindow } from '@main/windows/settings';
import { HistoryWindow } from '@main/windows/history';
import { HistoryStore, createElectronStorePersistence } from '@main/history/store';
import { RecordingController } from '@main/recording/controller';
import { createWhisperClient } from '@main/transcription/whisper-client';
import { createTextInjector } from '@main/injection/injector';
import { registerIpcHandlers } from '@main/ipc/handlers';
import { getSettings, onSettingsChange } from '@main/store/settings';
import { getApiKey, hasApiKey } from '@main/store/secrets';

app.setName(APP_NAME);
if (isMac) {
  app.setAppUserModelId(APP_ID);
  app.dock?.hide();
}

if (ensureSingleInstance()) {
  const tray = new TrayManager();
  const hotkey = new HotkeyManager();
  const overlay = new OverlayWindow();
  const settingsWindow = new SettingsWindow();
  const historyWindow = new HistoryWindow();
  // Recent transcriptions. Memory-only unless the user opts into
  // app.persistHistory (see the Privacy card on the About page).
  const history = new HistoryStore({
    getLimit: () => getSettings().app.historyLimit,
    getPersist: () => getSettings().app.persistHistory,
    persistence: createElectronStorePersistence()
  });
  // Whisper getter: keytar first, .env.local fallback (dev convenience).
  const whisper = createWhisperClient({
    getApiKey: async () => {
      const fromKeychain = await getApiKey();
      if (fromKeychain) return fromKeychain;
      return getEnv('OPENAI_API_KEY');
    },
    getPrompt: () => {
      const s = getSettings();
      return composeWhisperPrompt(
        s.transcription.vocabularyPresets,
        s.transcription.customVocabulary
      );
    },
    getLanguage: () => {
      const lang = getSettings().transcription.language;
      return lang === 'auto' ? undefined : lang;
    },
    getModel: () => getSettings().transcription.model
  });
  const injector = createTextInjector();

  // The success update carries the text but not the recording length; the
  // preceding `processing` update does. Remember it per recording.
  let lastDurationMs = 0;

  const controller = new RecordingController({
    whisper,
    injector,
    showOverlay: () => overlay.show(),
    hideOverlay: () => overlay.hide(),
    requestRendererStart: () => overlay.send(IPC.recording.start),
    requestRendererStop: () => overlay.send(IPC.recording.stop),
    broadcastState: (update) => {
      overlay.send(IPC.state.update, update);
      tray.setState(update.state === 'success' || update.state === 'error' ? 'idle' : update.state);

      if (update.state === 'recording' && update.interimText === undefined) {
        lastDurationMs = 0;
      }
      if (typeof update.durationMs === 'number') {
        lastDurationMs = update.durationMs;
      }
      if (update.state === 'success' && update.text) {
        history.add({
          text: update.text,
          durationMs: update.durationMs ?? lastDurationMs,
          output: getSettings().output.mode
        });
      }
    },
    getHotkeyMode: () => getSettings().hotkey.mode,
    getFilterHallucinations: () => getSettings().transcription.filterHallucinations,
    getWhisperPrompt: () => {
      const s = getSettings();
      return composeWhisperPrompt(
        s.transcription.vocabularyPresets,
        s.transcription.customVocabulary
      );
    },
    getOutputMode: () => getSettings().output.mode,
    getStreaming: () => getSettings().transcription.streaming,
    getLanguage: () => {
      const lang = getSettings().transcription.language;
      return lang === 'auto' ? undefined : lang;
    }
  });

  setupLifecycle(() => {
    tray.destroy();
    hotkey.unregister();
    stopUiohook();
    overlay.destroy();
    settingsWindow.destroy();
    historyWindow.destroy();
  });

  app.whenReady().then(async () => {
    logger.info(`${APP_NAME} starting`, {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron
    });

    // A damaged Electron runtime (missing resources.pak) renders every
    // window without Chromium's default stylesheet. Tell the user to
    // reinstall rather than leave them with a scrambled Settings window.
    const integrity = checkChromiumResources();
    if (!integrity.ok) {
      logger.error('chromium resources missing — installation is damaged', {
        missing: integrity.missing
      });
      void dialog.showMessageBox({
        type: 'warning',
        title: APP_NAME,
        message: 'การติดตั้งไม่สมบูรณ์ / Installation is incomplete',
        detail:
          `ไม่พบไฟล์ที่จำเป็นของ Electron ทำให้หน้าจอแสดงผลผิดเพี้ยน กรุณาติดตั้ง ${APP_NAME} ใหม่ ` +
          '(ถ้ารันจาก source: ลบ node_modules/electron แล้วรัน npm install ใหม่)\n\n' +
          `A required Electron runtime file is missing, so windows will render incorrectly. ` +
          `Please reinstall ${APP_NAME}.\n\nMissing: ${integrity.missing.join(', ')}`
      });
    }

    // Eagerly read settings + warn if neither keychain nor env has an API key.
    const settings = getSettings();
    const keychain = await hasApiKey();
    if (!keychain && !getEnv('OPENAI_API_KEY')) {
      logger.warn('No OpenAI API key in keychain or .env.local — open Settings to add one');
    } else {
      logger.info('api key source', { keychain, env: !!getEnv('OPENAI_API_KEY') });
    }

    tray.init({
      openSettings: () => settingsWindow.open(),
      openHistory: () => historyWindow.open(),
      getHotkey: () => {
        const s = getSettings();
        return { combo: s.hotkey.combo, mode: s.hotkey.mode };
      }
    });
    overlay.ensure();
    registerIpcHandlers({ controller, settingsWindow, historyWindow, history, hotkey });

    try {
      hotkey.register(settings.hotkey.combo, settings.hotkey.mode);
      hotkey.onPress(() => controller.pressed());
      hotkey.onRelease(() => controller.released());
    } catch (err) {
      logger.error('hotkey registration failed at startup', {
        message: (err as Error).message
      });
    }

    // Settings → General → "Launch at login". Applied at startup and on change.
    applyLaunchOnStartup(settings.app.launchOnStartup);

    // Re-register hotkey when the user changes combo OR mode via Settings.
    let lastCombo = settings.hotkey.combo;
    let lastMode = settings.hotkey.mode;
    let lastLaunchOnStartup = settings.app.launchOnStartup;
    let lastHistoryLimit = settings.app.historyLimit;
    let lastPersistHistory = settings.app.persistHistory;
    onSettingsChange((s) => {
      // Keep the tray menu's "Hotkey: …" line in sync with Settings.
      tray.refresh();
      // Native title bar / dialogs follow the chosen theme.
      nativeTheme.themeSource = s.ui.theme;
      if (s.app.launchOnStartup !== lastLaunchOnStartup) {
        lastLaunchOnStartup = s.app.launchOnStartup;
        applyLaunchOnStartup(s.app.launchOnStartup);
      }
      // History: a lowered limit trims at once (0 = disabled, drops all);
      // persistence off wipes the disk copy, on writes the current list.
      if (s.app.historyLimit !== lastHistoryLimit) {
        lastHistoryLimit = s.app.historyLimit;
        history.applyLimit();
      }
      if (s.app.persistHistory !== lastPersistHistory) {
        lastPersistHistory = s.app.persistHistory;
        history.setPersist(s.app.persistHistory);
      }
      if (s.hotkey.combo !== lastCombo || s.hotkey.mode !== lastMode) {
        try {
          hotkey.register(s.hotkey.combo, s.hotkey.mode);
          lastCombo = s.hotkey.combo;
          lastMode = s.hotkey.mode;
        } catch (err) {
          logger.error('hotkey re-register failed after settings change', {
            combo: s.hotkey.combo,
            mode: s.hotkey.mode,
            message: (err as Error).message
          });
        }
      }
    });

    logger.info(`${APP_NAME} ready`);
  });
}

/**
 * Register / unregister the app as a login item. No-op in dev (the Electron
 * binary would be registered instead of the packaged app) and on Linux.
 */
function applyLaunchOnStartup(enabled: boolean): void {
  if (!app.isPackaged || process.platform === 'linux') return;
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
    logger.info('login item updated', { openAtLogin: enabled });
  } catch (err) {
    logger.warn('failed to update login item', { message: (err as Error).message });
  }
}
