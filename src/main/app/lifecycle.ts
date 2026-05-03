import { app, globalShortcut } from 'electron';
import { logger } from '@main/utils/logger';
import { isMac } from '@main/utils/platform';

export function setupLifecycle(onShutdown: () => void): void {
  // On macOS, keep the app running when all windows are closed (tray app).
  app.on('window-all-closed', () => {
    if (!isMac) {
      app.quit();
    }
  });

  app.on('will-quit', () => {
    logger.info('app will-quit, releasing shortcuts');
    globalShortcut.unregisterAll();
    onShutdown();
  });

  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', { err: err.message, stack: err.stack });
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', { reason: String(reason) });
  });
}
