/**
 * Utility modules index
 *
 * @module utils
 */

export { logger, LogLevel, Logger } from './logger'

export {
  detectRuntime,
  detectFeatures,
  isLogseqAvailable,
  hasWebCrypto,
  hasFetch,
  hasFileSystem,
  hasIndexedDB,
  clearEnvironmentCache,
  assertFeature,
  getEnvironmentDescription,
  type RuntimeEnvironment,
  type EnvironmentFeatures,
} from './environment'
