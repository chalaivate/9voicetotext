import { app } from 'electron';
import { APP_ID, APP_NAME } from '@shared/constants';
import { IPC } from '@shared/ipc-channels';
import { logger } from '@main/utils/logger';
import { isMac } from '@main/utils/platform';
import { getEnv } from '@main/utils/env';
import { ensureSingleInstance } from '@main/app/single-instance';
import { setupLifecycle } from '@main/app/lifecycle';
import { TrayManager } from '@main/tray/manager';
import { HotkeyManager } from '@main/hotkey/manager';
import { OverlayWindow } from '@main/windows/overlay';
import { SettingsWindow } from '@main/windows/settings';
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
  // Whisper getter: keytar first, .env.local fallback (dev convenience).
  const whisper = createWhisperClient(async () => {
    const fromKeychain = await getApiKey();
    if (fromKeychain) return fromKeychain;
    return getEnv('OPENAI_API_KEY');
  });
  const injector = createTextInjector();

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
    }
  });

  setupLifecycle(() => {
    tray.destroy();
    hotkey.unregister();
    overlay.destroy();
    settingsWindow.destroy();
  });

  app.whenReady().then(async () => {
    logger.info(`${APP_NAME} starting`, {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron
    });

    // Eagerly read settings + warn if neither keychain nor env has an API key.
    const settings = getSettings();
    const keychain = await hasApiKey();
    if (!keychain && !getEnv('OPENAI_API_KEY')) {
      logger.warn('No OpenAI API key in keychain or .env.local — open Settings to add one');
    } else {
      logger.info('api key source', { keychain, env: !!getEnv('OPENAI_API_KEY') });
    }

    tray.init({
      openSettings: () => settingsWindow.open()
      // openHistory: provided in Sprint 4c
    });
    overlay.ensure();
    registerIpcHandlers({ controller, settingsWindow });

    try {
      hotkey.register(settings.hotkey.combo);
      hotkey.onPress(() => controller.togglePressed());
    } catch (err) {
      logger.error('hotkey registration failed at startup', {
        message: (err as Error).message
      });
    }

    // Re-register hotkey when the user changes it via Settings.
    onSettingsChange((s) => {
      try {
        hotkey.register(s.hotkey.combo);
      } catch (err) {
        logger.error('hotkey re-register failed after settings change', {
          combo: s.hotkey.combo,
          message: (err as Error).message
        });
      }
    });

    logger.info(`${APP_NAME} ready`);
  });
}
