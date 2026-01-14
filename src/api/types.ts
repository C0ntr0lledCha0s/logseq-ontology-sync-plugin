/**
 * API-specific types for Logseq Ontology Sync
 * Provides type definitions for properties, classes, transactions, and errors
 */

// ============================================================================
// Property Types
// ============================================================================

/**
 * Property value types supported by Logseq
 */
export type PropertyValueType =
  | 'default' // Text/string
  | 'number'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'url'
  | 'page' // Reference to another page
  | 'node' // Reference to a block

/**
 * Property cardinality - single or multiple values
 */
export type PropertyCardinality = 'one' | 'many'

/**
 * Definition for creating or updating a property
 */
export interface PropertyDefinition {
  /** Property name (will be normalized to kebab-case) */
  name: string
  /** Human-readable title */
  title?: string
  /** Description of the property */
  description?: string
  /** Value type */
  type: PropertyValueType
  /** Single or multiple values */
  cardinality: PropertyCardinality
  /** Whether property is hidden in UI */
  hide?: boolean
  /** Schema version for migrations */
  schemaVersion?: number
  /** Classes this property applies to */
  classes?: string[]
  /** Default value */
  defaultValue?: unknown
  /** Allowed values for enum-like properties */
  choices?: string[]
}

/**
 * Property entity as stored in Logseq
 */
export interface PropertyEntity {
  /** Entity ID in Logseq's database */
  id: number
  /** UUID of the property page */
  uuid: string
  /** Normalized property name (kebab-case) */
  name: string
  /** Original property name */
  originalName: string
  /** Property type */
  type: PropertyValueType
  /** Property cardinality */
  cardinality: PropertyCardinality
  /** Whether property is hidden */
  hide: boolean
  /** Schema version */
  schemaVersion: number
  /** Associated class names */
  classes: string[]
  /** Raw properties from Logseq */
  properties?: Record<string, unknown>
}

// ============================================================================
// Class Types
// ============================================================================

/**
 * Definition for creating or updating a class (tag)
 */
export interface ClassDefinition {
  /** Class name */
  name: string
  /** Human-readable title */
  title?: string
  /** Description of the class */
  description?: string
  /** Parent class for inheritance */
  parent?: string
  /** Properties that belong to this class */
  properties?: string[]
  /** Icon for UI display */
  icon?: string
  /** Schema version for migrations */
  schemaVersion?: number
}

/**
 * Class entity as stored in Logseq
 */
export interface ClassEntity {
  /** Entity ID in Logseq's database */
  id: number
  /** UUID of the class page */
  uuid: string
  /** Normalized class name */
  name: string
  /** Original class name */
  originalName: string
  /** Parent class name if any */
  parent?: string
  /** Child class names */
  children: string[]
  /** Property names associated with this class */
  properties: string[]
  /** Schema version */
  schemaVersion: number
  /** Raw properties from Logseq */
  rawProperties?: Record<string, unknown>
}

// ============================================================================
// Transaction Types
// ============================================================================

/**
 * Operation types in a transaction
 */
export type TransactionOperationType =
  | 'create-property'
  | 'update-property'
  | 'delete-property'
  | 'create-class'
  | 'update-class'
  | 'delete-class'
  | 'create-page'
  | 'update-page'
  | 'delete-page'
  | 'create-block'
  | 'update-block'
  | 'delete-block'

/**
 * Single operation within a transaction
 */
export interface TransactionOperation {
  /** Type of operation */
  type: TransactionOperationType
  /** Target entity ID or name */
  target: string | number
  /** Data for the operation */
  data?: Record<string, unknown>
  /** Original state for rollback */
  originalState?: Record<string, unknown>
}

/**
 * Transaction state
 */
export type TransactionState = 'pending' | 'committed' | 'rolled-back' | 'failed'

/**
 * Transaction result
 */
export interface TransactionResult {
  /** Whether the transaction succeeded */
  success: boolean
  /** Operations that were executed */
  operations: TransactionOperation[]
  /** Error if transaction failed */
  error?: LogseqAPIError
  /** Duration in milliseconds */
  duration: number
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error codes for API operations
 */
export enum LogseqErrorCode {
  // Connection errors
  NOT_CONNECTED = 'NOT_CONNECTED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',

  // Entity errors
  ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',
  ENTITY_ALREADY_EXISTS = 'ENTITY_ALREADY_EXISTS',
  INVALID_ENTITY = 'INVALID_ENTITY',

  // Property errors
  PROPERTY_NOT_FOUND = 'PROPERTY_NOT_FOUND',
  PROPERTY_ALREADY_EXISTS = 'PROPERTY_ALREADY_EXISTS',
  INVALID_PROPERTY_TYPE = 'INVALID_PROPERTY_TYPE',
  PROPERTY_IN_USE = 'PROPERTY_IN_USE',

  // Class errors
  CLASS_NOT_FOUND = 'CLASS_NOT_FOUND',
  CLASS_ALREADY_EXISTS = 'CLASS_ALREADY_EXISTS',
  CLASS_HAS_CHILDREN = 'CLASS_HAS_CHILDREN',
  CIRCULAR_INHERITANCE = 'CIRCULAR_INHERITANCE',

  // Transaction errors
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  ROLLBACK_FAILED = 'ROLLBACK_FAILED',
  OPERATION_FAILED = 'OPERATION_FAILED',

  // Query errors
  INVALID_QUERY = 'INVALID_QUERY',
  QUERY_TIMEOUT = 'QUERY_TIMEOUT',

  // Validation errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_NAME = 'INVALID_NAME',

  // Generic errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Base error class for Logseq API errors
 */
export class LogseqAPIError extends Error {
  readonly code: LogseqErrorCode
  readonly details?: Record<string, unknown>
  readonly cause?: Error

  constructor(
    message: string,
    code: LogseqErrorCode = LogseqErrorCode.UNKNOWN_ERROR,
    details?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message)
    this.name = 'LogseqAPIError'
    this.code = code
    this.details = details
    this.cause = cause

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LogseqAPIError)
    }
  }

  /**
   * Create a formatted error message with details
   */
  toDetailedString(): string {
    const parts = [`[${this.code}] ${this.message}`]
    if (this.details) {
      parts.push(`Details: ${JSON.stringify(this.details)}`)
    }
    if (this.cause) {
      parts.push(`Caused by: ${this.cause.message}`)
    }
    return parts.join('\n')
  }
}

// ============================================================================
// Batch Operation Types
// ============================================================================

/**
 * Batch operation item
 */
export interface BatchItem<T> {
  /** Unique identifier for tracking */
  id: string
  /** The data to process */
  data: T
}

/**
 * Result of a single batch item
 */
export interface BatchItemResult<T, R> {
  /** Original item */
  item: BatchItem<T>
  /** Result if successful */
  result?: R
  /** Error if failed */
  error?: LogseqAPIError
  /** Whether this item succeeded */
  success: boolean
}

/**
 * Overall batch operation result
 */
export interface BatchResult<T, R> {
  /** Total items processed */
  total: number
  /** Number of successful operations */
  succeeded: number
  /** Number of failed operations */
  failed: number
  /** Individual results */
  results: BatchItemResult<T, R>[]
  /** Duration in milliseconds */
  duration: number
}

/**
 * Options for batch operations
 */
export interface BatchOptions {
  /** Stop on first error */
  stopOnError?: boolean
  /** Batch size for chunking */
  batchSize?: number
  /** Delay between batches in ms */
  delayBetweenBatches?: number
  /** Progress callback */
  onProgress?: (progress: BatchProgress) => void
}

/**
 * Progress information for batch operations
 */
export interface BatchProgress {
  /** Current item index (0-based) */
  current: number
  /** Total items */
  total: number
  /** Percentage complete (0-100) */
  percentage: number
  /** Current item being processed */
  currentItem?: string
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Datascript query result type
 */
export type QueryResult<T = unknown> = T[] | null

/**
 * Query options
 */
export interface QueryOptions {
  /** Timeout in milliseconds */
  timeout?: number
  /** Query inputs (bindings) */
  inputs?: unknown[]
}

// ============================================================================
// Page/Block Types (extended from Logseq)
// ============================================================================

/**
 * Extended block entity with additional metadata
 */
export interface ExtendedBlockEntity {
  id: number
  uuid: string
  content: string
  properties?: Record<string, unknown>
  parent?: { id: number }
  left?: { id: number }
  format?: 'markdown' | 'org'
  page?: { id: number }
  children?: ExtendedBlockEntity[]
}

/**
 * Extended page entity with additional metadata
 */
export interface ExtendedPageEntity {
  id: number
  uuid: string
  name: string
  originalName: string
  properties?: Record<string, unknown>
  'journal?': boolean
  file?: { id: number }
  namespace?: { id: number }
  updatedAt?: number
  format?: 'markdown' | 'org'
}

// ============================================================================
// API Configuration Types
// ============================================================================

/**
 * Configuration options for the API
 */
export interface LogseqAPIConfig {
  /** Enable debug logging */
  debug?: boolean
  /** Default timeout for operations in ms */
  defaultTimeout?: number
  /** Number of retries for failed operations */
  retryCount?: number
  /** Delay between retries in ms */
  retryDelay?: number
}

/**
 * Default API configuration
 */
export const DEFAULT_API_CONFIG: Required<LogseqAPIConfig> = {
  debug: false,
  defaultTimeout: 30000,
  retryCount: 3,
  retryDelay: 1000,
}
