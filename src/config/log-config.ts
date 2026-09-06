// Copyright © 2026 Michael Artner
import pino from "pino";
import { ServerConfig } from './server-config';

const DEV = ServerConfig.DEV_MODE;

// log levels:
// trace(10) → debug(20) → info(30) → warn(40) → error(50) → fatal(60)
export const LOGGER = pino({
  level: DEV ? 'debug' : process.env.LOG_LEVEL || 'info',
  customLevels: {
    apiinfo: 24,    // less important than regular info
    apierror: 51,   // basically the same importance as other errors, just 51 to easier distinguish them
    database: 35,   // between info(30) and warn(40)
  },
  base: {
    isDev: DEV,
    version: ServerConfig.VERSION,
    vFrontend: ServerConfig.FRONTEND_VERSION,
  },
  formatters: DEV? {
    level(label) {
      return { level: label };
    }
  } : undefined,
  transport: DEV? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname'
    }
  } : undefined,
});

LOGGER.info(`ServerConfig = ${ServerConfig.toString()}`)
