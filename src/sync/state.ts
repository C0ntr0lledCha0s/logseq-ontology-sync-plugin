/**
 * Sync State Manager module
 * Handles persistence and retrieval of sync state
 */

import { logger } from '../utils/logger'
import type { SyncState, SyncHistoryEntry } from './types'
import { SyncError, SyncErrorCode } from './types'

/** Maximum number of history entries to retain per source */
const MAX_HISTORY_ENTRIES = 100

/** Storage key prefix for sync state */
const STORAGE_KEY_PREFIX = 'ontology-sync-state-'

/**
 * Manages sync state persistence using Logseq settings storage
 */
export class SyncStateManager {
  private storageBackend: SyncStateStorage

  constructor(storage?: SyncStateStorage) {
    this.storageBackend = storage ?? new LogseqSyncStateStorage()
  }

  /**
   * Get the sync state for a source
   * @param sourceId - Unique identifier for the source
   * @returns The sync state or null if not found
   */
  async getState(sourceId: string): Promise<SyncState | null> {
    try {
      const state = await this.storageBackend.get(sourceId)
      if (!state) {
        logger.debug(`No sync state found for source: ${sourceId}`)
        return null
      }
      return this.validateState(state)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Failed to get sync state for ${sourceId}:`, error)
      throw new SyncError(
        `Failed to get sync state: ${message}`,
        SyncErrorCode.STATE_ERROR,
        sourceId
      )
    }
  }

  /**
   * Update the sync state for a source
   * @param sourceId - Unique identifier for the source
   * @param updates - Partial state updates to apply
   */
  async updateState(sourceId: string, updates: Partial<SyncState>): Promise<void> {
    try {
      let currentState = await this.storageBackend.get(sourceId)

      if (!currentState) {
        // Create new state with defaults
        currentState = this.createDefaultState(sourceId)
      }

      const newState: SyncState = {
        ...currentState,
        ...updates,
        sourceId, // Ensure sourceId is never overwritten
      }

      await this.storageBackend.set(sourceId, newState)
      logger.debug(`Updated sync state for source: ${sourceId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Failed to update sync state for ${sourceId}:`, error)
      throw new SyncError(
        `Failed to update sync state: ${message}`,
        SyncErrorCode.STATE_ERROR,
        sourceId
      )
    }
  }

  /**
   * Record a sync operation in the history
   * @param sourceId - Unique identifier for the source
   * @param entry - History entry without timestamp (will be added)
   */
  async recordSync(sourceId: string, entry: Omit<SyncHistoryEntry, 'timestamp'>): Promise<void> {
    try {
      let currentState = await this.storageBackend.get(sourceId)

      if (!currentState) {
        currentState = this.createDefaultState(sourceId)
      }

      const historyEntry: SyncHistoryEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
      }

      // Add new entry and trim if necessary
      const history = [historyEntry, ...currentState.syncHistory]
      if (history.length > MAX_HISTORY_ENTRIES) {
        history.length = MAX_HISTORY_ENTRIES
      }

      const newState: SyncState = {
        ...currentState,
        syncHistory: history,
        // Update lastSyncedAt if this was a successful sync
        ...(entry.action === 'sync' && entry.result === 'success'
          ? { lastSyncedAt: historyEntry.timestamp }
          : {}),
      }

      await this.storageBackend.set(sourceId, newState)
      logger.debug(`Recorded sync history for source: ${sourceId}`, entry)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Failed to record sync history for ${sourceId}:`, error)
      throw new SyncError(
        `Failed to record sync history: ${message}`,
        SyncErrorCode.STATE_ERROR,
        sourceId
      )
    }
  }

  /**
   * Clear all sync state for a source
   * @param sourceId - Unique identifier for the source
   */
  async clearState(sourceId: string): Promise<void> {
    try {
      await this.storageBackend.delete(sourceId)
      logger.debug(`Cleared sync state for source: ${sourceId}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error(`Failed to clear sync state for ${sourceId}:`, error)
      throw new SyncError(
        `Failed to clear sync state: ${message}`,
        SyncErrorCode.STATE_ERROR,
        sourceId
      )
    }
  }

  /**
   * Get all stored source IDs
   * @returns Array of source IDs with stored state
   */
  async getAllSourceIds(): Promise<string[]> {
    try {
      return await this.storageBackend.getAllKeys()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Failed to get all source IDs:', error)
      throw new SyncError(`Failed to get source IDs: ${message}`, SyncErrorCode.STATE_ERROR)
    }
  }

  /**
   * Create a default sync state for a new source
   */
  private createDefaultState(sourceId: string): SyncState {
    return {
      sourceId,
      lastSyncedAt: '',
      lastChecksum: '',
      localModifications: false,
      syncHistory: [],
    }
  }

  /**
   * Validate and normalize a sync state object
   */
  private validateState(state: unknown): SyncState | null {
    if (!state || typeof state !== 'object') {
      return null
    }

    const s = state as Record<string, unknown>

    if (typeof s['sourceId'] !== 'string') {
      return null
    }

    return {
      sourceId: s['sourceId'],
      lastSyncedAt: typeof s['lastSyncedAt'] === 'string' ? s['lastSyncedAt'] : '',
      lastChecksum: typeof s['lastChecksum'] === 'string' ? s['lastChecksum'] : '',
      localModifications:
        typeof s['localModifications'] === 'boolean' ? s['localModifications'] : false,
      syncHistory: Array.isArray(s['syncHistory']) ? this.validateHistory(s['syncHistory']) : [],
    }
  }

  /**
   * Validate history entries array
   */
  private validateHistory(history: unknown[]): SyncHistoryEntry[] {
    return history
      .filter((entry): entry is SyncHistoryEntry => {
        if (!entry || typeof entry !== 'object') return false
        const e = entry as Record<string, unknown>
        return (
          typeof e['timestamp'] === 'string' &&
          ['sync', 'check', 'rollback'].includes(e['action'] as string) &&
          ['success', 'failed', 'conflicts'].includes(e['result'] as string) &&
          typeof e['details'] === 'string'
        )
      })
      .slice(0, MAX_HISTORY_ENTRIES)
  }
}

/**
 * Storage interface for sync state
 */
export interface SyncStateStorage {
  get(sourceId: string): Promise<SyncState | null>
  set(sourceId: string, state: SyncState): Promise<void>
  delete(sourceId: string): Promise<void>
  getAllKeys(): Promise<string[]>
}

/**
 * Logseq-based storage implementation
 */
export class LogseqSyncStateStorage implements SyncStateStorage {
  get(sourceId: string): Promise<SyncState | null> {
    const key = STORAGE_KEY_PREFIX + sourceId
    const settings = logseq.settings
    if (!settings) return Promise.resolve(null)
    const value = settings[key]
    return Promise.resolve(value as SyncState | null)
  }

  set(sourceId: string, state: SyncState): Promise<void> {
    const key = STORAGE_KEY_PREFIX + sourceId
    logseq.updateSettings({ [key]: state })
    return Promise.resolve()
  }

  delete(sourceId: string): Promise<void> {
    const key = STORAGE_KEY_PREFIX + sourceId
    logseq.updateSettings({ [key]: null })
    return Promise.resolve()
  }

  getAllKeys(): Promise<string[]> {
    const settings = logseq.settings
    if (!settings) return Promise.resolve([])
    return Promise.resolve(
      Object.keys(settings)
        .filter((key) => key.startsWith(STORAGE_KEY_PREFIX))
        .map((key) => key.slice(STORAGE_KEY_PREFIX.length))
    )
  }
}

/**
 * In-memory storage implementation for testing
 */
export class InMemorySyncStateStorage implements SyncStateStorage {
  private store: Map<string, SyncState> = new Map()

  get(sourceId: string): Promise<SyncState | null> {
    return Promise.resolve(this.store.get(sourceId) ?? null)
  }

  set(sourceId: string, state: SyncState): Promise<void> {
    this.store.set(sourceId, state)
    return Promise.resolve()
  }

  delete(sourceId: string): Promise<void> {
    this.store.delete(sourceId)
    return Promise.resolve()
  }

  getAllKeys(): Promise<string[]> {
    return Promise.resolve(Array.from(this.store.keys()))
  }

  /** Clear all stored state (for testing) */
  clear(): void {
    this.store.clear()
  }
}
