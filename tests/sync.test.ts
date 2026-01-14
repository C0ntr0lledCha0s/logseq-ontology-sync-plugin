import { describe, test, expect, beforeEach, mock } from 'bun:test'
import {
  SyncEngine,
  SyncStateManager,
  InMemorySyncStateStorage,
  SyncError,
  SyncErrorCode,
  type ContentFetcher,
  type ContentDiffer,
  type SyncSource,
  type FetchedContent,
  type ImportPreview,
  type SyncState,
} from '../src/sync'

// Mock content fetcher for testing
class MockContentFetcher implements ContentFetcher {
  private responses: Map<string, FetchedContent | Error> = new Map()
  public fetchCallCount = 0

  setResponse(sourceId: string, response: FetchedContent | Error): void {
    this.responses.set(sourceId, response)
  }

  async fetch(source: SyncSource, _timeout?: number): Promise<FetchedContent> {
    this.fetchCallCount++
    const response = this.responses.get(source.id)

    if (!response) {
      throw new SyncError(`No mock response for ${source.id}`, SyncErrorCode.NOT_FOUND, source.id)
    }

    if (response instanceof Error) {
      throw response
    }

    return response
  }

  reset(): void {
    this.responses.clear()
    this.fetchCallCount = 0
  }
}

// Mock content differ for testing
class MockContentDiffer implements ContentDiffer {
  private result: ImportPreview = {
    classesToAdd: [],
    classesToUpdate: [],
    classesToRemove: [],
    propertiesToAdd: [],
    propertiesToUpdate: [],
    propertiesToRemove: [],
  }

  setResult(preview: ImportPreview): void {
    this.result = preview
  }

  diff(_localContent: string | null, _remoteContent: string): ImportPreview {
    return this.result
  }
}

describe('SyncStateManager', () => {
  let storage: InMemorySyncStateStorage
  let stateManager: SyncStateManager

  beforeEach(() => {
    storage = new InMemorySyncStateStorage()
    stateManager = new SyncStateManager(storage)
  })

  test('should return null for non-existent state', async () => {
    const state = await stateManager.getState('non-existent')
    expect(state).toBeNull()
  })

  test('should create and retrieve state', async () => {
    await stateManager.updateState('test-source', {
      lastChecksum: 'abc123',
      localModifications: true,
    })

    const state = await stateManager.getState('test-source')
    expect(state).not.toBeNull()
    expect(state?.sourceId).toBe('test-source')
    expect(state?.lastChecksum).toBe('abc123')
    expect(state?.localModifications).toBe(true)
  })

  test('should update existing state', async () => {
    await stateManager.updateState('test-source', {
      lastChecksum: 'abc123',
    })

    await stateManager.updateState('test-source', {
      lastChecksum: 'def456',
    })

    const state = await stateManager.getState('test-source')
    expect(state?.lastChecksum).toBe('def456')
  })

  test('should record sync history', async () => {
    await stateManager.recordSync('test-source', {
      action: 'sync',
      result: 'success',
      details: 'Test sync',
    })

    const state = await stateManager.getState('test-source')
    expect(state?.syncHistory).toHaveLength(1)
    expect(state?.syncHistory[0]?.action).toBe('sync')
    expect(state?.syncHistory[0]?.result).toBe('success')
    expect(state?.syncHistory[0]?.details).toBe('Test sync')
    expect(state?.syncHistory[0]?.timestamp).toBeDefined()
  })

  test('should update lastSyncedAt on successful sync', async () => {
    await stateManager.recordSync('test-source', {
      action: 'sync',
      result: 'success',
      details: 'Test sync',
    })

    const state = await stateManager.getState('test-source')
    expect(state?.lastSyncedAt).toBeDefined()
    expect(state?.lastSyncedAt).not.toBe('')
  })

  test('should not update lastSyncedAt on failed sync', async () => {
    await stateManager.recordSync('test-source', {
      action: 'sync',
      result: 'failed',
      details: 'Test failure',
    })

    const state = await stateManager.getState('test-source')
    expect(state?.lastSyncedAt).toBe('')
  })

  test('should clear state', async () => {
    await stateManager.updateState('test-source', {
      lastChecksum: 'abc123',
    })

    await stateManager.clearState('test-source')

    const state = await stateManager.getState('test-source')
    expect(state).toBeNull()
  })

  test('should get all source IDs', async () => {
    await stateManager.updateState('source-1', { lastChecksum: 'a' })
    await stateManager.updateState('source-2', { lastChecksum: 'b' })

    const ids = await stateManager.getAllSourceIds()
    expect(ids).toContain('source-1')
    expect(ids).toContain('source-2')
  })

  test('should limit history entries', async () => {
    // Record more than MAX_HISTORY_ENTRIES
    for (let i = 0; i < 110; i++) {
      await stateManager.recordSync('test-source', {
        action: 'check',
        result: 'success',
        details: `Check ${i}`,
      })
    }

    const state = await stateManager.getState('test-source')
    expect(state?.syncHistory.length).toBeLessThanOrEqual(100)
  })

  test('should prepend new history entries', async () => {
    await stateManager.recordSync('test-source', {
      action: 'check',
      result: 'success',
      details: 'First',
    })

    await stateManager.recordSync('test-source', {
      action: 'sync',
      result: 'success',
      details: 'Second',
    })

    const state = await stateManager.getState('test-source')
    expect(state?.syncHistory[0]?.details).toBe('Second')
    expect(state?.syncHistory[1]?.details).toBe('First')
  })
})

describe('SyncEngine', () => {
  let storage: InMemorySyncStateStorage
  let fetcher: MockContentFetcher
  let differ: MockContentDiffer
  let engine: SyncEngine

  const testSource: SyncSource = {
    id: 'test-source',
    name: 'Test Source',
    url: 'https://example.com/ontology.edn',
    type: 'url',
    defaultStrategy: 'overwrite',
  }

  const testContent: FetchedContent = {
    content: '{:class "TestClass" :property "testProp"}',
    checksum: 'abc123def456',
    lastModified: '2024-01-15T00:00:00Z',
  }

  beforeEach(() => {
    storage = new InMemorySyncStateStorage()
    fetcher = new MockContentFetcher()
    differ = new MockContentDiffer()
    engine = new SyncEngine({
      storage,
      fetcher,
      differ,
      retryCount: 1, // Disable retries for faster tests
    })
  })

  describe('Source Management', () => {
    test('should register and retrieve source', () => {
      engine.registerSource(testSource)
      const source = engine.getSource('test-source')
      expect(source).toEqual(testSource)
    })

    test('should unregister source', () => {
      engine.registerSource(testSource)
      engine.unregisterSource('test-source')
      const source = engine.getSource('test-source')
      expect(source).toBeUndefined()
    })

    test('should return undefined for unregistered source', () => {
      const source = engine.getSource('non-existent')
      expect(source).toBeUndefined()
    })
  })

  describe('checkForUpdates', () => {
    test('should throw for unregistered source', async () => {
      await expect(engine.checkForUpdates('non-existent')).rejects.toThrow(SyncError)
    })

    test('should return hasUpdates=true for new source', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      const result = await engine.checkForUpdates('test-source')

      expect(result.hasUpdates).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    test('should return hasUpdates=false when checksum matches', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      // First sync to set checksum
      await engine.sync('test-source')

      // Check again with same content
      const result = await engine.checkForUpdates('test-source')

      expect(result.hasUpdates).toBe(false)
    })

    test('should return hasUpdates=true when checksum differs', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      // First sync to set checksum
      await engine.sync('test-source')

      // Update content
      fetcher.setResponse('test-source', {
        ...testContent,
        checksum: 'different-checksum',
      })

      const result = await engine.checkForUpdates('test-source')

      expect(result.hasUpdates).toBe(true)
    })

    test('should handle network errors gracefully', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse(
        'test-source',
        new SyncError('Network failed', SyncErrorCode.NETWORK_ERROR, 'test-source')
      )

      const result = await engine.checkForUpdates('test-source')

      expect(result.hasUpdates).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toContain('Network failed')
    })

    test('should record check in history', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      await engine.checkForUpdates('test-source')

      const history = await engine.getHistory('test-source')
      expect(history).toHaveLength(1)
      expect(history[0]?.action).toBe('check')
    })
  })

  describe('sync', () => {
    test('should throw for unregistered source', async () => {
      await expect(engine.sync('non-existent')).rejects.toThrow(SyncError)
    })

    test('should sync and update state', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      const result = await engine.sync('test-source')

      expect(result.hasUpdates).toBe(true)
      expect(result.errors).toHaveLength(0)

      const state = await engine.getSyncState('test-source')
      expect(state?.lastChecksum).toBe(testContent.checksum)
      expect(state?.localModifications).toBe(false)
    })

    test('should return hasUpdates=false when already synced', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      await engine.sync('test-source')
      const result = await engine.sync('test-source')

      expect(result.hasUpdates).toBe(false)
    })

    test('should handle dry run', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      const result = await engine.sync('test-source', undefined, { dryRun: true })

      expect(result.hasUpdates).toBe(true)
      expect(result.preview).toBeDefined()
      expect(result.applied).toBeUndefined()

      // State should not be updated (should remain null since no actual sync occurred)
      const state = await engine.getSyncState('test-source')
      expect(state).toBeNull()
    })

    test('should detect conflicts with local modifications', async () => {
      engine.registerSource({
        ...testSource,
        defaultStrategy: 'ask',
      })
      fetcher.setResponse('test-source', testContent)

      // First sync
      await engine.sync('test-source', 'overwrite')

      // Mark local modifications
      await engine.markLocalModifications('test-source')

      // Update content
      fetcher.setResponse('test-source', {
        ...testContent,
        checksum: 'new-checksum',
      })

      // Try to sync with 'ask' strategy
      const result = await engine.sync('test-source', 'ask')

      expect(result.hasUpdates).toBe(true)
      expect(result.errors).toContain('Local modifications detected')
    })

    test('should handle network errors gracefully', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse(
        'test-source',
        new SyncError('Network failed', SyncErrorCode.NETWORK_ERROR, 'test-source')
      )

      const result = await engine.sync('test-source')

      expect(result.hasUpdates).toBe(false)
      expect(result.errors).toHaveLength(1)

      const history = await engine.getHistory('test-source')
      expect(history[0]?.result).toBe('failed')
    })

    test('should record sync in history', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      await engine.sync('test-source')

      const history = await engine.getHistory('test-source')
      expect(history).toHaveLength(1)
      expect(history[0]?.action).toBe('sync')
      expect(history[0]?.result).toBe('success')
    })

    test('should use source default strategy', async () => {
      const sourceWithMerge: SyncSource = {
        ...testSource,
        defaultStrategy: 'merge',
      }
      engine.registerSource(sourceWithMerge)
      fetcher.setResponse('test-source', testContent)

      await engine.sync('test-source')

      // Verify sync completed (strategy is used internally)
      const state = await engine.getSyncState('test-source')
      expect(state?.lastChecksum).toBe(testContent.checksum)
    })

    test('should override default strategy when provided', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      await engine.sync('test-source', 'keep-local')

      const state = await engine.getSyncState('test-source')
      expect(state?.lastChecksum).toBe(testContent.checksum)
    })
  })

  describe('getSyncState', () => {
    test('should return null for new source', async () => {
      engine.registerSource(testSource)

      const state = await engine.getSyncState('test-source')
      expect(state).toBeNull()
    })

    test('should return state after sync', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      await engine.sync('test-source')

      const state = await engine.getSyncState('test-source')
      expect(state).not.toBeNull()
      expect(state?.sourceId).toBe('test-source')
    })
  })

  describe('getHistory', () => {
    test('should return empty array for new source', async () => {
      engine.registerSource(testSource)

      const history = await engine.getHistory('test-source')
      expect(history).toHaveLength(0)
    })

    test('should return history entries', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      await engine.checkForUpdates('test-source')
      await engine.sync('test-source')

      const history = await engine.getHistory('test-source')
      expect(history).toHaveLength(2)
    })
  })

  describe('markLocalModifications', () => {
    test('should mark local modifications', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      await engine.sync('test-source')
      await engine.markLocalModifications('test-source')

      const state = await engine.getSyncState('test-source')
      expect(state?.localModifications).toBe(true)
    })
  })

  describe('clearSyncState', () => {
    test('should clear sync state', async () => {
      engine.registerSource(testSource)
      fetcher.setResponse('test-source', testContent)

      await engine.sync('test-source')
      await engine.clearSyncState('test-source')

      const state = await engine.getSyncState('test-source')
      expect(state).toBeNull()
    })
  })

  describe('Retry Logic', () => {
    test('should retry on transient errors', async () => {
      const retryEngine = new SyncEngine({
        storage,
        fetcher,
        differ,
        retryCount: 3,
      })

      retryEngine.registerSource(testSource)

      // First call fails, subsequent calls succeed
      let callCount = 0
      const originalFetch = fetcher.fetch.bind(fetcher)
      fetcher.fetch = async (source: SyncSource, timeout?: number) => {
        callCount++
        if (callCount === 1) {
          throw new SyncError('Transient error', SyncErrorCode.NETWORK_ERROR, source.id)
        }
        fetcher.setResponse('test-source', testContent)
        return originalFetch(source, timeout)
      }

      const result = await retryEngine.checkForUpdates('test-source')

      expect(result.hasUpdates).toBe(true)
      expect(callCount).toBeGreaterThan(1)
    })

    test('should not retry on NOT_FOUND errors', async () => {
      const retryEngine = new SyncEngine({
        storage,
        fetcher,
        differ,
        retryCount: 3,
      })

      retryEngine.registerSource(testSource)
      fetcher.setResponse(
        'test-source',
        new SyncError('Not found', SyncErrorCode.NOT_FOUND, 'test-source')
      )

      const result = await retryEngine.checkForUpdates('test-source')

      expect(result.errors).toHaveLength(1)
      expect(fetcher.fetchCallCount).toBe(1) // No retries
    })
  })
})

describe('SyncError', () => {
  test('should create error with code', () => {
    const error = new SyncError('Test error', SyncErrorCode.NETWORK_ERROR, 'source-1')

    expect(error.message).toBe('Test error')
    expect(error.code).toBe(SyncErrorCode.NETWORK_ERROR)
    expect(error.sourceId).toBe('source-1')
    expect(error.name).toBe('SyncError')
  })

  test('should create error without sourceId', () => {
    const error = new SyncError('Test error', SyncErrorCode.STATE_ERROR)

    expect(error.message).toBe('Test error')
    expect(error.sourceId).toBeUndefined()
  })
})

describe('InMemorySyncStateStorage', () => {
  let storage: InMemorySyncStateStorage

  beforeEach(() => {
    storage = new InMemorySyncStateStorage()
  })

  test('should get and set values', async () => {
    const state: SyncState = {
      sourceId: 'test',
      lastSyncedAt: '',
      lastChecksum: 'abc',
      localModifications: false,
      syncHistory: [],
    }

    await storage.set('test', state)
    const retrieved = await storage.get('test')

    expect(retrieved).toEqual(state)
  })

  test('should delete values', async () => {
    const state: SyncState = {
      sourceId: 'test',
      lastSyncedAt: '',
      lastChecksum: 'abc',
      localModifications: false,
      syncHistory: [],
    }

    await storage.set('test', state)
    await storage.delete('test')
    const retrieved = await storage.get('test')

    expect(retrieved).toBeNull()
  })

  test('should get all keys', async () => {
    const state1: SyncState = {
      sourceId: 'test1',
      lastSyncedAt: '',
      lastChecksum: 'abc',
      localModifications: false,
      syncHistory: [],
    }

    const state2: SyncState = {
      sourceId: 'test2',
      lastSyncedAt: '',
      lastChecksum: 'def',
      localModifications: false,
      syncHistory: [],
    }

    await storage.set('test1', state1)
    await storage.set('test2', state2)

    const keys = await storage.getAllKeys()

    expect(keys).toContain('test1')
    expect(keys).toContain('test2')
  })

  test('should clear all values', async () => {
    const state: SyncState = {
      sourceId: 'test',
      lastSyncedAt: '',
      lastChecksum: 'abc',
      localModifications: false,
      syncHistory: [],
    }

    await storage.set('test', state)
    storage.clear()

    const keys = await storage.getAllKeys()
    expect(keys).toHaveLength(0)
  })
})
