/**
 * Environment Detection Utilities
 *
 * Provides runtime detection for different JavaScript environments:
 * - Browser (Logseq plugin context)
 * - Node.js (testing)
 * - Bun (testing)
 *
 * @module utils/environment
 */

/**
 * Runtime environment types
 */
export type RuntimeEnvironment = 'browser' | 'node' | 'bun' | 'unknown'

/**
 * Feature availability flags
 */
export interface EnvironmentFeatures {
  /** Whether running in a browser */
  isBrowser: boolean
  /** Whether running in Node.js */
  isNode: boolean
  /** Whether running in Bun */
  isBun: boolean
  /** Whether the Logseq plugin API is available */
  hasLogseq: boolean
  /** Whether Web Crypto API is available */
  hasWebCrypto: boolean
  /** Whether Fetch API is available */
  hasFetch: boolean
  /** Whether local file system access is available */
  hasFileSystem: boolean
  /** Whether IndexedDB is available */
  hasIndexedDB: boolean
}

/**
 * Cached environment detection result
 */
let cachedFeatures: EnvironmentFeatures | null = null

/**
 * Detect the current runtime environment
 *
 * @returns The detected runtime environment
 *
 * @example
 * ```typescript
 * const env = detectRuntime()
 * if (env === 'browser') {
 *   // Use browser-specific APIs
 * }
 * ```
 */
export function detectRuntime(): RuntimeEnvironment {
  // Check for Bun first (Bun also has process.versions.node)
  if (typeof Bun !== 'undefined') {
    return 'bun'
  }

  // Check for Node.js
  if (
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.node &&
    typeof window === 'undefined'
  ) {
    return 'node'
  }

  // Check for browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'browser'
  }

  return 'unknown'
}

/**
 * Check if the Logseq plugin API is available
 *
 * @returns True if logseq global is defined and has expected methods
 */
export function isLogseqAvailable(): boolean {
  try {
    return (
      typeof logseq !== 'undefined' &&
      logseq !== null &&
      typeof logseq.Editor !== 'undefined' &&
      typeof logseq.DB !== 'undefined'
    )
  } catch {
    return false
  }
}

/**
 * Check if Web Crypto API is available
 *
 * @returns True if crypto.subtle is available
 */
export function hasWebCrypto(): boolean {
  try {
    return (
      typeof crypto !== 'undefined' &&
      crypto !== null &&
      typeof crypto.subtle !== 'undefined' &&
      typeof crypto.subtle.digest === 'function'
    )
  } catch {
    return false
  }
}

/**
 * Check if Fetch API is available
 *
 * @returns True if fetch is available
 */
export function hasFetch(): boolean {
  try {
    return typeof fetch === 'function'
  } catch {
    return false
  }
}

/**
 * Check if file system access is available (Node/Bun only)
 *
 * @returns True if fs module is available
 */
export function hasFileSystem(): boolean {
  const runtime = detectRuntime()
  return runtime === 'node' || runtime === 'bun'
}

/**
 * Check if IndexedDB is available (browser only)
 *
 * @returns True if IndexedDB is available
 */
export function hasIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null
  } catch {
    return false
  }
}

/**
 * Detect all environment features
 *
 * @returns Object with all feature availability flags
 *
 * @example
 * ```typescript
 * const features = detectFeatures()
 * if (features.hasLogseq) {
 *   await logseq.Editor.createPage('test')
 * } else {
 *   console.warn('Running outside Logseq context')
 * }
 * ```
 */
export function detectFeatures(): EnvironmentFeatures {
  // Return cached result if available
  if (cachedFeatures !== null) {
    return cachedFeatures
  }

  const runtime = detectRuntime()

  cachedFeatures = {
    isBrowser: runtime === 'browser',
    isNode: runtime === 'node',
    isBun: runtime === 'bun',
    hasLogseq: isLogseqAvailable(),
    hasWebCrypto: hasWebCrypto(),
    hasFetch: hasFetch(),
    hasFileSystem: hasFileSystem(),
    hasIndexedDB: hasIndexedDB(),
  }

  return cachedFeatures
}

/**
 * Clear the cached environment detection (useful for testing)
 */
export function clearEnvironmentCache(): void {
  cachedFeatures = null
}

/**
 * Assert that a feature is available, throwing if not
 *
 * @param feature - The feature to check
 * @param featureName - Human-readable name for error message
 * @throws Error if feature is not available
 *
 * @example
 * ```typescript
 * assertFeature(detectFeatures().hasLogseq, 'Logseq API')
 * // Throws: "Required feature not available: Logseq API"
 * ```
 */
export function assertFeature(feature: boolean, featureName: string): void {
  if (!feature) {
    throw new Error(`Required feature not available: ${featureName}`)
  }
}

/**
 * Get a human-readable description of the current environment
 *
 * @returns Environment description string
 */
export function getEnvironmentDescription(): string {
  const features = detectFeatures()
  const runtime = detectRuntime()

  const parts: string[] = [`Runtime: ${runtime}`]

  if (features.hasLogseq) {
    parts.push('Logseq: available')
  }

  if (features.hasWebCrypto) {
    parts.push('WebCrypto: available')
  }

  if (features.hasFileSystem) {
    parts.push('FileSystem: available')
  }

  return parts.join(', ')
}
