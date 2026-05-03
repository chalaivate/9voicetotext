import { app } from 'electron';
import { APP_ID, APP_NAME, DEFAULT_HOTKEY } from '@shared/constants';
import { IPC } from '@shared/ipc-channels';
import { logger } from '@main/utils/logger';
import { isMac } from '@main/utils/platform';
import { getEnv } from '@main/utils/env';
import { ensureSingleInstance } from '@main/app/single-instance';
import { setupLifecycle } from '@main/app/lifecycle';
import { TrayManager } from '@main/tray/manager';
import { HotkeyManager } from '@main/hotkey/manager';
import { OverlayWindow } from '@main/windows/overlay';
import { RecordingController } from '@main/recording/controller';
import { createWhisperClient } from '@main/transcription/whisper-client';
import { createTextInjector } from '@main/injection/injector';
import { registerIpcHandlers } from '@main/ipc/handlers';

app.setName(APP_NAME);
if (isMac) {
  app.setAppUserModelId(APP_ID);
  app.dock?.hide();
}

if (ensureSingleInstance()) {
  const tray = new TrayManager();
  const hotkey = new HotkeyManager();
  const overlay = new OverlayWindow();
  const whisper = createWhisperClient(() => getEnv('OPENAI_API_KEY'));
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
  });

  app.whenReady().then(() => {
    logger.info(`${APP_NAME} starting`, {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron
    });

    if (!getEnv('OPENAI_API_KEY')) {
      logger.warn(
        'OPENAI_API_KEY not set — transcription will fail until you add it to .env.local'
      );
    }

    tray.init();
    overlay.ensure();
    registerIpcHandlers(controller);

    try {
      hotkey.register(DEFAULT_HOTKEY);
      hotkey.onPress(() => controller.togglePressed());
    } catch (err) {
      logger.error('hotkey registration failed at startup', {
        message: (err as Error).message
      });
    }

    logger.info(`${APP_NAME} ready`);
  });
}
