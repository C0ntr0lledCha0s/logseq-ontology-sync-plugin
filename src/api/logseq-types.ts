/**
 * Logseq API Type Utilities
 *
 * Helper functions for working with the global `logseq` object provided by @logseq/libs.
 * The actual type definitions come from the @logseq/libs package.
 *
 * @remarks
 * The `logseq` global is provided by @logseq/libs and is available at runtime
 * within a Logseq plugin context. Use `isLogseqAvailable()` to check for availability.
 *
 * @see https://plugins-doc.logseq.com/
 */

import type { ILSPluginUser } from '@logseq/libs/dist/LSPlugin.user'

// Re-export commonly used types from @logseq/libs for convenience
export type {
  PageEntity as LogseqPage,
  BlockEntity as LogseqBlock,
} from '@logseq/libs/dist/LSPlugin.user'

/**
 * Declare the global `logseq` object provided by @logseq/libs
 *
 * This enables TypeScript to understand the `logseq` global that is
 * injected at runtime when the plugin is loaded in Logseq.
 */
declare global {
  // eslint-disable-next-line no-var
  var logseq: ILSPluginUser
}

/**
 * Type guard to check if we're running in a Logseq plugin context
 *
 * @returns true if the logseq global is available
 *
 * @example
 * ```typescript
 * if (isLogseqAvailable()) {
 *   await logseq.Editor.createPage('test')
 * } else {
 *   console.warn('Not running in Logseq context')
 * }
 * ```
 */
export function isLogseqAvailable(): boolean {
  return typeof logseq !== 'undefined' && logseq !== null
}

/**
 * Get the logseq API with runtime check
 *
 * @returns The logseq API instance
 * @throws Error if logseq is not available
 *
 * @example
 * ```typescript
 * const api = getLogseqAPI()
 * await api.Editor.createPage('test')
 * ```
 */
export function getLogseqAPI(): typeof logseq {
  if (!isLogseqAvailable()) {
    throw new Error(
      'Logseq API is not available. This code must run within a Logseq plugin context.'
    )
  }
  return logseq
}
