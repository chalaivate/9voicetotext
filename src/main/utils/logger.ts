import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import winston from 'winston';

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, ...rest }) => {
    const extra = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
    return `${timestamp} ${level} ${message}${extra}`;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

let real: winston.Logger | null = null;

function build(): winston.Logger {
  // We resolve electron at use-time, not import-time, so unit tests outside
  // an Electron runtime can pull in modules that depend on this logger.
  let userDataDir: string | null = null;
  let isPackaged = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const electron = require('electron') as typeof import('electron');
    if (electron.app && typeof electron.app.getPath === 'function') {
      userDataDir = electron.app.getPath('userData');
      isPackaged = electron.app.isPackaged;
    }
  } catch {
    // not running inside Electron (e.g. vitest) — console-only logger
  }

  const transports: winston.transport[] = [
    new winston.transports.Console({ format: consoleFormat })
  ];

  if (userDataDir) {
    const logsDir = join(userDataDir, 'logs');
    try {
      mkdirSync(logsDir, { recursive: true });
      transports.push(
        new winston.transports.File({
          filename: join(logsDir, 'app.log'),
          maxsize: 10 * 1024 * 1024,
          maxFiles: 3,
          tailable: true,
          format: fileFormat
        })
      );
    } catch {
      // fall back to console only
    }
  }

  return winston.createLogger({
    level: isPackaged ? 'info' : 'debug',
    format: fileFormat,
    transports
  });
}

function get(): winston.Logger {
  if (!real) real = build();
  return real;
}

export const logger = {
  debug: (msg: string, meta?: object): void => {
    get().debug(msg, meta);
  },
  info: (msg: string, meta?: object): void => {
    get().info(msg, meta);
  },
  warn: (msg: string, meta?: object): void => {
    get().warn(msg, meta);
  },
  error: (msg: string, meta?: object): void => {
    get().error(msg, meta);
  }
};
