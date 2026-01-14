/**
 * Sync module
 * Provides synchronization functionality for ontology templates
 */

// Type exports
export type {
  SyncState,
  SyncHistoryEntry,
  SyncResult,
  SyncStrategy,
  SyncSource,
  SyncOptions,
  ImportPreview,
  FetchedContent,
} from './types'

export { SyncError, SyncErrorCode } from './types'

// State management exports
export {
  SyncStateManager,
  LogseqSyncStateStorage,
  InMemorySyncStateStorage,
  type SyncStateStorage,
} from './state'

// Engine exports
export {
  SyncEngine,
  NetworkContentFetcher,
  DefaultContentDiffer,
  createSyncEngine,
  type ContentFetcher,
  type ContentDiffer,
} from './engine'
