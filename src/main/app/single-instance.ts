import { app } from 'electron';
import { logger } from '@main/utils/logger';

export function ensureSingleInstance(): boolean {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    logger.warn('another instance is already running, quitting');
    app.quit();
    return false;
  }
  app.on('second-instance', () => {
    logger.info('second instance launched, ignoring (tray-only app)');
  });
  return true;
}
