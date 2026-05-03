import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-channels';
import { logger } from '@main/utils/logger';
import type { RecordingController } from '@main/recording/controller';

export function registerIpcHandlers(controller: RecordingController): void {
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
}
