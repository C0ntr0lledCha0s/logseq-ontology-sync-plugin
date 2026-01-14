/**
 * API module exports
 */

export { LogseqOntologyAPI } from './ontology-api'
export {
  executeQuery,
  buildFilterQuery,
  QUERY_ALL_PROPERTIES,
  QUERY_ALL_CLASSES,
  QUERY_PROPERTY_BY_NAME,
  QUERY_CLASS_BY_NAME,
  QUERY_CLASS_PROPERTIES,
  QUERY_PROPERTY_USAGE,
} from './queries'
export * from './logseq-api'
export type {
  PropertyValueType,
  PropertyCardinality,
  PropertyDefinition,
  PropertyEntity,
  ClassDefinition,
  ClassEntity,
  TransactionOperationType,
  TransactionOperation,
  TransactionState,
  TransactionResult,
  LogseqErrorCode,
  BatchItem,
  BatchItemResult,
  BatchOptions,
  BatchProgress,
  QueryResult,
  QueryOptions,
  ExtendedBlockEntity,
  ExtendedPageEntity,
  LogseqAPIConfig,
} from './types'

// Re-export LogseqAPIError as class
export { LogseqAPIError, DEFAULT_API_CONFIG } from './types'

// Type aliases for backwards compatibility and plan compliance
export type Transaction = {
  id: string
  operations: TransactionOperation[]
  status: 'pending' | 'committed' | 'failed' | 'rolledback'
  startedAt: string
  completedAt?: string
}

export type TransactionStatus = 'pending' | 'committed' | 'failed' | 'rolledback'

export type APIError = LogseqAPIError

export type ProgressCallback = (progress: ProgressInfo) => void

export interface ProgressInfo {
  current: number
  total: number
  percentage: number
  message?: string
}

export interface BatchResult {
  total: number
  succeeded: number
  failed: number
  errors: BatchError[]
}

export interface BatchError {
  index: number
  error: string
}

// Import TransactionOperation for the Transaction type
import type { TransactionOperation, LogseqAPIError } from './types'
