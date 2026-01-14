/**
 * Sync module type definitions
 *
 * Defines interfaces for synchronization state tracking and operations.
 * Re-exports common types from unified type system.
 *
 * @module sync/types
 */

// Re-export from unified types
export type { SyncStrategy, ConflictResolution } from '../types'

/**
 * Individual entry in the sync history log
 */
export interface SyncHistoryEntry {
  /** ISO timestamp of when the action occurred */
  timestamp: string
  /** Type of sync action performed */
  action: 'sync' | 'check' | 'rollback'
  /** Result of the action */
  result: 'success' | 'failed' | 'conflicts'
  /** Human-readable details about the action */
  details: string
}

/**
 * Persistent state for a sync source
 */
export interface SyncState {
  /** Unique identifier for the source */
  sourceId: string
  /** ISO timestamp of last successful sync */
  lastSyncedAt: string
  /** Checksum of the last synced content */
  lastChecksum: string
  /** Whether local modifications exist since last sync */
  localModifications: boolean
  /** History of sync operations */
  syncHistory: SyncHistoryEntry[]
}

/**
 * Lightweight preview of changes for sync operations
 *
 * @remarks
 * Unlike the full ImportPreview in unified types, this uses string arrays
 * for efficiency when only names are needed. Use converters to transform
 * to full ImportPreview when detailed preview is required.
 */
export interface ImportPreview {
  /** Classes to be added */
  classesToAdd: string[]
  /** Classes to be updated */
  classesToUpdate: string[]
  /** Classes to be removed */
  classesToRemove: string[]
  /** Properties to be added */
  propertiesToAdd: string[]
  /** Properties to be updated */
  propertiesToUpdate: string[]
  /** Properties to be removed */
  propertiesToRemove: string[]
}

/**
 * Alias for clarity - sync module's lightweight preview
 */
export type SyncPreview = ImportPreview

/**
 * Result of a sync operation
 */
export interface SyncResult {
  /** Whether there are updates available */
  hasUpdates: boolean
  /** Preview of changes (available after check) */
  preview?: ImportPreview
  /** Count of applied changes (available after sync) */
  applied?: { classes: number; properties: number }
  /** Any errors that occurred during the operation */
  errors: string[]
}

/**
 * Configuration for a sync source
 */
export interface SyncSource {
  /** Unique identifier */
  id: string
  /** Human-readable name */
  name: string
  /** URL or path to the source */
  url: string
  /** Type of source */
  type: 'url' | 'file' | 'github'
  /** Default sync strategy */
  defaultStrategy: import('../types').SyncStrategy
}

/**
 * Options for sync operations
 */
export interface SyncOptions {
  /** Strategy for handling conflicts */
  strategy?: import('../types').SyncStrategy
  /** Whether to apply changes or just preview */
  dryRun?: boolean
  /** Timeout in milliseconds for network operations */
  timeout?: number
}

/**
 * Content fetched from a sync source
 */
export interface FetchedContent {
  /** Raw content string */
  content: string
  /** Content checksum */
  checksum: string
  /** Last modified timestamp from source */
  lastModified?: string
  /** ETag for cache validation */
  etag?: string
}

/**
 * Error codes for sync operations
 */
export enum SyncErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_SOURCE = 'INVALID_SOURCE',
  PARSE_ERROR = 'PARSE_ERROR',
  CONFLICT = 'CONFLICT',
  STATE_ERROR = 'STATE_ERROR',
  TIMEOUT = 'TIMEOUT',
  NOT_FOUND = 'NOT_FOUND',
}

/**
 * Error specific to sync operations
 */
export class SyncError extends Error {
  constructor(
    message: string,
    public readonly code: SyncErrorCode,
    public readonly sourceId?: string
  ) {
    super(message)
    this.name = 'SyncError'
  }
}
