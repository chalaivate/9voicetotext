import { join } from 'node:path';
import { app, nativeImage, type NativeImage } from 'electron';
import type { AppState } from '@shared/types';

const iconRoot = app.isPackaged
  ? join(process.resourcesPath, 'resources', 'icons')
  : join(__dirname, '../../resources/icons');

const filenameFor: Record<AppState, string> = {
  idle: 'tray-idle.png',
  recording: 'tray-recording.png',
  processing: 'tray-processing.png',
  injecting: 'tray-processing.png',
  success: 'tray-idle.png',
  error: 'tray-idle.png'
};

export function trayIcon(state: AppState): NativeImage {
  const fileName = filenameFor[state] ?? filenameFor.idle;
  const fullPath = join(iconRoot, fileName);
  const image = nativeImage.createFromPath(fullPath);
  // On macOS, mark as template so it inverts with light/dark menu bar.
  if (process.platform === 'darwin') {
    image.setTemplateImage(true);
  }
  return image;
}
