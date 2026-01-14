import { describe, test, expect } from 'bun:test'
import { Logger, LogLevel } from '../src/utils/logger'

describe('Logger', () => {
  test('should create logger with default level', () => {
    const logger = new Logger()
    expect(logger).toBeDefined()
  })

  test('should create logger with custom level', () => {
    const logger = new Logger(LogLevel.DEBUG)
    expect(logger).toBeDefined()
  })

  test('should have all log methods', () => {
    const logger = new Logger()
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })
})
