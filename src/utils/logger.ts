/**
 * Logger utility module
 * Provides structured logging for the plugin
 */

const PLUGIN_PREFIX = '[Ontology Sync]'

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

export class Logger {
  private level: LogLevel

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR]
    const currentIndex = levels.indexOf(this.level)
    const messageIndex = levels.indexOf(level)
    return messageIndex >= currentIndex
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      // eslint-disable-next-line no-console
      console.debug(`${PLUGIN_PREFIX} [DEBUG]`, message, ...args)
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      // eslint-disable-next-line no-console
      console.log(`${PLUGIN_PREFIX} [INFO]`, message, ...args)
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(`${PLUGIN_PREFIX} [WARN]`, message, ...args)
    }
  }

  error(message: string, error?: unknown, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(`${PLUGIN_PREFIX} [ERROR]`, message, error, ...args)
    }
  }
}

export const logger = new Logger()
