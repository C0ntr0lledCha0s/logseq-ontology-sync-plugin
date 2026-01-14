/**
 * Sync Engine module
 * Main coordinator for synchronization operations
 */

import { logger } from '../utils/logger'
import { SyncStateManager, type SyncStateStorage } from './state'
import type {
  SyncState,
  SyncResult,
  SyncStrategy,
  SyncHistoryEntry,
  SyncOptions,
  ImportPreview,
  FetchedContent,
  SyncSource,
} from './types'
import { SyncError, SyncErrorCode } from './types'

/** Default timeout for network operations (30 seconds) */
const DEFAULT_TIMEOUT = 30000

/** Default retry count for network failures */
const DEFAULT_RETRY_COUNT = 3

/** Delay between retries in milliseconds */
const RETRY_DELAY = 1000

/**
 * Content fetcher interface for fetching content from sources
 */
export interface ContentFetcher {
  fetch(source: SyncSource, timeout?: number): Promise<FetchedContent>
}

/**
 * Default content fetcher using fetch API
 */
export class NetworkContentFetcher implements ContentFetcher {
  async fetch(source: SyncSource, timeout = DEFAULT_TIMEOUT): Promise<FetchedContent> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(source.url, {
        signal: controller.signal,
        headers: {
          Accept: 'text/plain, application/edn, application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new SyncError(`Source not found: ${source.url}`, SyncErrorCode.NOT_FOUND, source.id)
        }
        throw new SyncError(
          `Failed to fetch: ${response.status} ${response.statusText}`,
          SyncErrorCode.NETWORK_ERROR,
          source.id
        )
      }

      const content = await response.text()
      const checksum = await this.computeChecksum(content)

      return {
        content,
        checksum,
        lastModified: response.headers.get('last-modified') ?? undefined,
        etag: response.headers.get('etag') ?? undefined,
      }
    } catch (error) {
      if (error instanceof SyncError) {
        throw error
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SyncError(
          `Request timed out after ${timeout}ms`,
          SyncErrorCode.TIMEOUT,
          source.id
        )
      }
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new SyncError(`Network error: ${message}`, SyncErrorCode.NETWORK_ERROR, source.id)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private async computeChecksum(content: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
}

/**
 * Content differ for computing import preview
 */
export interface ContentDiffer {
  diff(localContent: string | null, remoteContent: string): ImportPreview
}

/**
 * Default content differ implementation
 */
export class DefaultContentDiffer implements ContentDiffer {
  diff(localContent: string | null, remoteContent: string): ImportPreview {
    // Parse both contents and compute differences
    // This is a simplified implementation - real implementation would parse EDN
    const localItems = localContent
      ? this.extractItems(localContent)
      : { classes: [], properties: [] }
    const remoteItems = this.extractItems(remoteContent)

    const classesToAdd = remoteItems.classes.filter((c) => !localItems.classes.includes(c))
    const classesToRemove = localItems.classes.filter((c) => !remoteItems.classes.includes(c))
    const classesToUpdate = remoteItems.classes.filter(
      (c) => localItems.classes.includes(c) && this.hasChanges(c, localContent, remoteContent)
    )

    const propertiesToAdd = remoteItems.properties.filter(
      (p) => !localItems.properties.includes(p)
    )
    const propertiesToRemove = localItems.properties.filter(
      (p) => !remoteItems.properties.includes(p)
    )
    const propertiesToUpdate = remoteItems.properties.filter(
      (p) => localItems.properties.includes(p) && this.hasChanges(p, localContent, remoteContent)
    )

    return {
      classesToAdd,
      classesToUpdate,
      classesToRemove,
      propertiesToAdd,
      propertiesToUpdate,
      propertiesToRemove,
    }
  }

  private extractItems(content: string): { classes: string[]; properties: string[] } {
    // Simplified extraction - real implementation would use EDN parser
    const classes: string[] = []
    const properties: string[] = []

    // Match class definitions (simplified pattern)
    const classMatches = content.match(/:class\s+"([^"]+)"/g)
    if (classMatches) {
      for (const match of classMatches) {
        const nameMatch = match.match(/:class\s+"([^"]+)"/)
        if (nameMatch?.[1]) {
          classes.push(nameMatch[1])
        }
      }
    }

    // Match property definitions (simplified pattern)
    const propMatches = content.match(/:property\s+"([^"]+)"/g)
    if (propMatches) {
      for (const match of propMatches) {
        const nameMatch = match.match(/:property\s+"([^"]+)"/)
        if (nameMatch?.[1]) {
          properties.push(nameMatch[1])
        }
      }
    }

    return { classes, properties }
  }

  private hasChanges(
    _item: string,
    _localContent: string | null,
    _remoteContent: string
  ): boolean {
    // Simplified - would need proper content comparison
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return false
  }
}

/**
 * Main sync engine class
 */
export class SyncEngine {
  private stateManager: SyncStateManager
  private fetcher: ContentFetcher
  private differ: ContentDiffer
  private sources: Map<string, SyncSource> = new Map()
  private retryCount: number

  constructor(options?: {
    storage?: SyncStateStorage
    fetcher?: ContentFetcher
    differ?: ContentDiffer
    retryCount?: number
  }) {
    this.stateManager = new SyncStateManager(options?.storage)
    this.fetcher = options?.fetcher ?? new NetworkContentFetcher()
    this.differ = options?.differ ?? new DefaultContentDiffer()
    this.retryCount = options?.retryCount ?? DEFAULT_RETRY_COUNT
  }

  /**
   * Register a sync source
   */
  registerSource(source: SyncSource): void {
    this.sources.set(source.id, source)
    logger.debug(`Registered sync source: ${source.id}`)
  }

  /**
   * Unregister a sync source
   */
  unregisterSource(sourceId: string): void {
    this.sources.delete(sourceId)
    logger.debug(`Unregistered sync source: ${sourceId}`)
  }

  /**
   * Get a registered source
   */
  getSource(sourceId: string): SyncSource | undefined {
    return this.sources.get(sourceId)
  }

  /**
   * Check for updates from a source without applying them
   */
  async checkForUpdates(sourceId: string, options?: SyncOptions): Promise<SyncResult> {
    const source = this.sources.get(sourceId)
    if (!source) {
      throw new SyncError(`Source not found: ${sourceId}`, SyncErrorCode.INVALID_SOURCE, sourceId)
    }

    const errors: string[] = []
    let fetchedContent: FetchedContent

    try {
      logger.info(`Checking for updates from source: ${sourceId}`)
      fetchedContent = await this.fetchWithRetry(source, options?.timeout)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push(message)
      logger.error(`Failed to check for updates from ${sourceId}:`, error)

      // Record the failed check
      await this.stateManager.recordSync(sourceId, {
        action: 'check',
        result: 'failed',
        details: message,
      })

      return { hasUpdates: false, errors }
    }

    // Get current state to compare checksums
    const currentState = await this.stateManager.getState(sourceId)
    const hasUpdates = currentState?.lastChecksum !== fetchedContent.checksum

    // Compute diff preview if there are updates
    let preview: ImportPreview | undefined
    if (hasUpdates) {
      try {
        // Get local content for diffing (simplified - would need actual local content)
        const localContent = currentState ? await this.getLocalContent(sourceId) : null
        preview = this.differ.diff(localContent, fetchedContent.content)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to compute diff'
        errors.push(message)
        logger.warn(`Failed to compute diff for ${sourceId}:`, error)
      }
    }

    // Record the check
    await this.stateManager.recordSync(sourceId, {
      action: 'check',
      result: 'success',
      details: hasUpdates
        ? `Updates available (checksum: ${fetchedContent.checksum.slice(0, 8)}...)`
        : 'No updates available',
    })

    logger.info(`Check complete for ${sourceId}: hasUpdates=${hasUpdates}`)

    return {
      hasUpdates,
      preview,
      errors,
    }
  }

  /**
   * Sync from a source, optionally applying changes
   */
  async sync(
    sourceId: string,
    strategy?: SyncStrategy,
    options?: SyncOptions
  ): Promise<SyncResult> {
    const source = this.sources.get(sourceId)
    if (!source) {
      throw new SyncError(`Source not found: ${sourceId}`, SyncErrorCode.INVALID_SOURCE, sourceId)
    }

    const effectiveStrategy = strategy ?? source.defaultStrategy
    const errors: string[] = []
    let fetchedContent: FetchedContent

    try {
      logger.info(`Starting sync from source: ${sourceId} with strategy: ${effectiveStrategy}`)
      fetchedContent = await this.fetchWithRetry(source, options?.timeout)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push(message)
      logger.error(`Failed to sync from ${sourceId}:`, error)

      await this.stateManager.recordSync(sourceId, {
        action: 'sync',
        result: 'failed',
        details: message,
      })

      return { hasUpdates: false, errors }
    }

    // Check if there are updates
    const currentState = await this.stateManager.getState(sourceId)
    const hasUpdates = currentState?.lastChecksum !== fetchedContent.checksum

    if (!hasUpdates) {
      logger.info(`No updates for ${sourceId}`)
      await this.stateManager.recordSync(sourceId, {
        action: 'sync',
        result: 'success',
        details: 'No updates to apply',
      })
      return { hasUpdates: false, errors }
    }

    // Compute diff preview
    const localContent = currentState ? await this.getLocalContent(sourceId) : null
    const preview = this.differ.diff(localContent, fetchedContent.content)

    // Check for conflicts if local modifications exist
    if (currentState?.localModifications && effectiveStrategy === 'ask') {
      logger.warn(`Conflicts detected for ${sourceId}, strategy is 'ask'`)
      await this.stateManager.recordSync(sourceId, {
        action: 'sync',
        result: 'conflicts',
        details: 'Local modifications detected, user input required',
      })
      return { hasUpdates: true, preview, errors: ['Local modifications detected'] }
    }

    // Apply changes if not a dry run
    if (!options?.dryRun) {
      try {
        const applied = await this.applyChanges(
          sourceId,
          fetchedContent,
          preview,
          effectiveStrategy
        )

        // Update state with new checksum
        await this.stateManager.updateState(sourceId, {
          lastChecksum: fetchedContent.checksum,
          lastSyncedAt: new Date().toISOString(),
          localModifications: false,
        })

        await this.stateManager.recordSync(sourceId, {
          action: 'sync',
          result: 'success',
          details: `Applied ${applied.classes} classes and ${applied.properties} properties`,
        })

        logger.info(`Sync complete for ${sourceId}:`, applied)

        return { hasUpdates: true, preview, applied, errors }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to apply changes'
        errors.push(message)
        logger.error(`Failed to apply changes for ${sourceId}:`, error)

        await this.stateManager.recordSync(sourceId, {
          action: 'sync',
          result: 'failed',
          details: message,
        })

        return { hasUpdates: true, preview, errors }
      }
    }

    // Dry run - just return preview
    logger.info(`Dry run complete for ${sourceId}`)
    return { hasUpdates: true, preview, errors }
  }

  /**
   * Get the sync state for a source
   */
  async getSyncState(sourceId: string): Promise<SyncState | null> {
    return this.stateManager.getState(sourceId)
  }

  /**
   * Get sync history for a source
   */
  async getHistory(sourceId: string): Promise<SyncHistoryEntry[]> {
    const state = await this.stateManager.getState(sourceId)
    return state?.syncHistory ?? []
  }

  /**
   * Mark a source as having local modifications
   */
  async markLocalModifications(sourceId: string): Promise<void> {
    await this.stateManager.updateState(sourceId, {
      localModifications: true,
    })
    logger.debug(`Marked local modifications for ${sourceId}`)
  }

  /**
   * Clear the sync state for a source
   */
  async clearSyncState(sourceId: string): Promise<void> {
    await this.stateManager.clearState(sourceId)
    logger.debug(`Cleared sync state for ${sourceId}`)
  }

  /**
   * Fetch content with retry logic
   */
  private async fetchWithRetry(source: SyncSource, timeout?: number): Promise<FetchedContent> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.retryCount; attempt++) {
      try {
        return await this.fetcher.fetch(source, timeout)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error')
        logger.warn(
          `Fetch attempt ${attempt}/${this.retryCount} failed for ${source.id}:`,
          lastError.message
        )

        // Don't retry for non-transient errors
        if (error instanceof SyncError) {
          if (
            error.code === SyncErrorCode.NOT_FOUND ||
            error.code === SyncErrorCode.INVALID_SOURCE
          ) {
            throw error
          }
        }

        // Wait before retrying (except on last attempt)
        if (attempt < this.retryCount) {
          await this.delay(RETRY_DELAY * attempt)
        }
      }
    }

    throw lastError ?? new Error('Fetch failed after retries')
  }

  /**
   * Get local content for a source (placeholder)
   */
  private getLocalContent(_sourceId: string): Promise<string | null> {
    // This would retrieve the current local content for diffing
    // Actual implementation would depend on how content is stored
    return Promise.resolve(null)
  }

  /**
   * Apply changes from synced content
   */
  private applyChanges(
    _sourceId: string,
    _content: FetchedContent,
    preview: ImportPreview,
    _strategy: SyncStrategy
  ): Promise<{ classes: number; properties: number }> {
    // This would apply the actual changes to Logseq
    // Actual implementation would use the Logseq API
    const classCount =
      preview.classesToAdd.length + preview.classesToUpdate.length + preview.classesToRemove.length
    const propertyCount =
      preview.propertiesToAdd.length +
      preview.propertiesToUpdate.length +
      preview.propertiesToRemove.length

    return Promise.resolve({ classes: classCount, properties: propertyCount })
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

/**
 * Create a default sync engine instance
 */
export function createSyncEngine(options?: {
  storage?: SyncStateStorage
  fetcher?: ContentFetcher
  differ?: ContentDiffer
}): SyncEngine {
  return new SyncEngine(options)
}
