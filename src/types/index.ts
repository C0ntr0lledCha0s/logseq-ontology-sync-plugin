/**
 * Unified Type Definitions for Logseq Ontology Sync Plugin
 *
 * This module provides canonical types that work across all modules:
 * - Parser (EDN parsing)
 * - Import (template import workflow)
 * - Sync (source synchronization)
 * - Sources (source management)
 * - API (Logseq database operations)
 *
 * @module types
 *
 * @remarks
 * The unified type system ensures consistency across all plugin modules.
 * When working with different modules, use the converters from `./converters.ts`
 * to transform between module-specific and unified types.
 *
 * @example
 * ```typescript
 * import type { PropertyDefinition, ClassDefinition } from './types'
 * import { parserPropertyToUnified } from './types/converters'
 *
 * // Create a property definition
 * const property: PropertyDefinition = {
 *   name: 'my-property',
 *   type: 'default',
 *   cardinality: 'one',
 * }
 * ```
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * UUID representation (matches EDN #uuid tagged value)
 *
 * @remarks
 * Logseq uses UUIDs to uniquely identify entities like properties and classes.
 * In EDN format, these appear as `#uuid "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`.
 *
 * @example
 * ```typescript
 * const id: UUID = { uuid: '550e8400-e29b-41d4-a716-446655440000' }
 * ```
 */
export interface UUID {
  /** The UUID string in standard format */
  uuid: string
}

/**
 * Property schema types supported by Logseq
 *
 * @remarks
 * - `default` - Text/string values (most common)
 * - `number` - Numeric values
 * - `date` - Date values (without time)
 * - `datetime` - Date and time values
 * - `checkbox` - Boolean true/false
 * - `url` - URL/link values
 * - `page` - Reference to another page
 * - `node` - Reference to a block (node)
 */
export type PropertySchemaType =
  | 'default'
  | 'number'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'url'
  | 'page'
  | 'node'

/**
 * Property cardinality - single or multiple values
 *
 * @remarks
 * - `one` - Property accepts a single value
 * - `many` - Property accepts multiple values (array)
 */
export type PropertyCardinality = 'one' | 'many'

// ============================================================================
// Ontology Types (Unified)
// ============================================================================

/**
 * Closed value definition for enum-like properties
 *
 * @remarks
 * Used when a property has `closed: true` to define the allowed values.
 * Each closed value can have an icon and description for UI display.
 *
 * @example
 * ```typescript
 * const statusValues: ClosedValue[] = [
 *   { value: 'todo', icon: '📝', description: 'Not started' },
 *   { value: 'doing', icon: '🔄', description: 'In progress' },
 *   { value: 'done', icon: '✅', description: 'Completed' },
 * ]
 * ```
 */
export interface ClosedValue {
  /** Unique identifier for the value */
  id?: UUID
  /** The actual value string */
  value: string
  /** Optional icon for UI display */
  icon?: string
  /** Optional description explaining the value */
  description?: string
}

/**
 * Unified PropertyDefinition
 *
 * The canonical property definition type that works across all plugin modules.
 * Properties define the schema for data that can be attached to pages and blocks.
 *
 * @remarks
 * This unified type combines fields from:
 * - Parser module (EDN parsing)
 * - Import module (template import)
 * - Sync module (source synchronization)
 * - API module (Logseq database operations)
 *
 * @example
 * ```typescript
 * // Simple text property
 * const nameProperty: PropertyDefinition = {
 *   name: 'person-name',
 *   type: 'default',
 *   cardinality: 'one',
 *   description: 'The name of a person',
 * }
 *
 * // Multi-value property with closed values
 * const tagsProperty: PropertyDefinition = {
 *   name: 'tags',
 *   type: 'default',
 *   cardinality: 'many',
 *   closed: true,
 *   closedValues: [
 *     { value: 'important' },
 *     { value: 'urgent' },
 *   ],
 * }
 * ```
 */
export interface PropertyDefinition {
  // Identification
  /** Unique identifier (from Logseq database) */
  id?: UUID
  /** Property name in kebab-case (e.g., 'my-property') */
  name: string

  // Schema
  /** The data type of property values */
  type: PropertySchemaType
  /** Whether the property accepts one or many values */
  cardinality: PropertyCardinality

  // Metadata
  /** Human-readable description */
  description?: string
  /** Display title (defaults to name if not set) */
  title?: string
  /** Optional namespace prefix */
  namespace?: string
  /** Original key name before normalization */
  originalKey?: string

  // Values & validation
  /** Whether values are restricted to closedValues */
  closed?: boolean
  /** Allowed values when closed is true */
  closedValues?: ClosedValue[]
  /** Alternative to closedValues for simple string choices */
  choices?: string[]
  /** Default value for new instances */
  defaultValue?: unknown
  /** Whether the property is required */
  required?: boolean

  // Structure & UI
  /** Position hint for UI ordering */
  position?: string
  /** Whether to hide the property in UI */
  hide?: boolean
  /** Classes this property is associated with */
  classes?: string[]

  // Storage & migration
  /** Schema version for handling migrations */
  schemaVersion?: number

  // Raw data preservation
  /** Original parsed data (for round-trip preservation) */
  rawData?: Record<string, unknown>
}

/**
 * Unified ClassDefinition
 *
 * The canonical class definition type that works across all plugin modules.
 * Classes define categories/tags that can be applied to pages and blocks,
 * along with their associated properties.
 *
 * @remarks
 * In Logseq, classes are also known as "tags" and define:
 * - What properties are available for tagged items
 * - Inheritance hierarchy (parent classes)
 * - UI customization (icons)
 *
 * @example
 * ```typescript
 * // Simple class
 * const personClass: ClassDefinition = {
 *   name: 'Person',
 *   description: 'A person entity',
 *   properties: ['person-name', 'email', 'phone'],
 * }
 *
 * // Class with inheritance
 * const employeeClass: ClassDefinition = {
 *   name: 'Employee',
 *   parent: 'Person',
 *   properties: ['employee-id', 'department'],
 *   icon: '👔',
 * }
 * ```
 */
export interface ClassDefinition {
  // Identification
  /** Unique identifier (from Logseq database) */
  id?: UUID
  /** Class name (e.g., 'Person', 'Task') */
  name: string

  // Metadata
  /** Human-readable description */
  description?: string
  /** Display title (defaults to name if not set) */
  title?: string
  /** Optional namespace prefix */
  namespace?: string
  /** Original key name before normalization */
  originalKey?: string

  // Hierarchy
  /** Single parent class name (simple inheritance) */
  parent?: string
  /** Multiple parent UUIDs (for complex inheritance) */
  parents?: UUID[]
  /** Property names associated with this class */
  properties?: string[]

  // UI
  /** Icon for UI display */
  icon?: string
  /** Position hint for UI ordering */
  position?: string

  // Storage & migration
  /** Schema version for handling migrations */
  schemaVersion?: number

  // Raw data preservation
  /** Original parsed data (for round-trip preservation) */
  rawData?: Record<string, unknown>
}

// ============================================================================
// Import/Sync Types (Unified)
// ============================================================================

/**
 * Update to an existing class
 */
export interface ClassUpdate {
  name: string
  before: Partial<ClassDefinition>
  after: Partial<ClassDefinition>
  changes: string[]
}

/**
 * Update to an existing property
 */
export interface PropertyUpdate {
  name: string
  before: Partial<PropertyDefinition>
  after: Partial<PropertyDefinition>
  changes: string[]
}

/**
 * Conflict detected during import/sync
 */
export interface Conflict {
  type: 'class' | 'property'
  name: string
  reason: string
  existingValue: unknown
  newValue: unknown
  resolution?: ConflictResolution
}

export type ConflictResolution = 'overwrite' | 'skip' | 'ask'

/**
 * Unified ImportPreview
 * Combines sync and import preview formats
 */
export interface ImportPreview {
  // Full objects for detailed preview (import-style)
  newClasses: ClassDefinition[]
  updatedClasses: ClassUpdate[]
  newProperties: PropertyDefinition[]
  updatedProperties: PropertyUpdate[]

  // String lists for removal (sync-style)
  classesToRemove: string[]
  propertiesToRemove: string[]

  // Conflict information
  conflicts: Conflict[]

  // Summary statistics
  summary: {
    totalNew: number
    totalUpdated: number
    totalRemoved: number
    totalConflicts: number
  }
}

/**
 * Import/sync progress information
 */
export interface ImportProgress {
  phase: 'parsing' | 'validating' | 'comparing' | 'importing' | 'syncing'
  current: number
  total: number
  message: string
  percentage?: number
}

/**
 * Import error details
 */
export interface ImportError {
  code: string
  message: string
  item?: string
  details?: unknown
}

/**
 * Result of an import operation
 */
export interface ImportResult {
  success: boolean
  preview: ImportPreview
  applied: {
    classes: number
    properties: number
  }
  errors: ImportError[]
  duration: number
  dryRun: boolean
}

/**
 * Existing ontology state from the graph
 */
export interface ExistingOntology {
  classes: Map<string, ClassDefinition>
  properties: Map<string, PropertyDefinition>
}

// ============================================================================
// Source Types (Unified)
// ============================================================================

/**
 * Supported source types
 */
export type SourceType = 'local' | 'url' | 'github'

/**
 * Strategy for handling conflicts during sync
 */
export type SyncStrategy = 'overwrite' | 'merge' | 'keep-local' | 'ask'

/**
 * Unified Source definition
 * Merges SyncSource and TemplateSource
 */
export interface Source {
  id: string
  name: string
  location: string
  type: SourceType
  enabled: boolean
  description?: string
  version?: string
  lastFetched?: string
  checksum?: string
  syncStrategy?: SyncStrategy
}

/**
 * Input for creating a new source
 */
export type SourceInput = Omit<Source, 'id'>

/**
 * Partial update for an existing source
 */
export type SourceUpdate = Partial<Omit<Source, 'id'>>

/**
 * Result of fetching content from a source
 */
export interface FetchResult {
  content: string
  checksum: string
  fetchedAt: string
  source: Source
  lastModified?: string
  etag?: string
}

/**
 * Sync state for a source
 */
export interface SyncState {
  sourceId: string
  lastSyncedAt: string
  lastChecksum: string
  localModifications: boolean
  syncHistory: SyncHistoryEntry[]
}

/**
 * Entry in sync history
 */
export interface SyncHistoryEntry {
  timestamp: string
  action: 'sync' | 'check' | 'rollback'
  result: 'success' | 'failed' | 'conflicts'
  details: string
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  hasUpdates: boolean
  preview?: ImportPreview
  applied?: { classes: number; properties: number }
  errors: string[]
}

/**
 * Options for sync operations
 */
export interface SyncOptions {
  strategy?: SyncStrategy
  dryRun?: boolean
  timeout?: number
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation severity levels
 */
export type ValidationSeverity = 'error' | 'warning' | 'info'

/**
 * Single validation issue
 */
export interface ValidationIssue {
  severity: ValidationSeverity
  code: string
  message: string
  path?: string
  line?: number
  column?: number
  suggestion?: string
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  issues?: ValidationIssue[]
  stats?: ValidationStats
}

/**
 * Validation statistics
 */
export interface ValidationStats {
  totalProperties: number
  totalClasses: number
  totalPages: number
  totalBlocks: number
  errorCount: number
  warningCount: number
  infoCount: number
}

// ============================================================================
// API Types
// ============================================================================

/**
 * Transaction definition
 */
export interface Transaction {
  id: string
  operations: TransactionOperation[]
  status: TransactionStatus
  startedAt: string
  completedAt?: string
}

export type TransactionStatus = 'pending' | 'committed' | 'failed' | 'rolledback'

/**
 * Transaction operation
 */
export interface TransactionOperation {
  type: TransactionOperationType
  id?: string
  data?: Record<string, unknown>
}

export type TransactionOperationType =
  | 'createProperty'
  | 'updateProperty'
  | 'deleteProperty'
  | 'createClass'
  | 'updateClass'
  | 'deleteClass'

/**
 * Progress callback type
 */
export type ProgressCallback = (progress: ProgressInfo) => void

/**
 * Progress information
 */
export interface ProgressInfo {
  current: number
  total: number
  percentage: number
  message?: string
}

/**
 * Batch operation error
 */
export interface BatchError {
  index: number
  error: string
}

/**
 * Batch operation result
 */
export interface BatchResult {
  total: number
  succeeded: number
  failed: number
  errors: BatchError[]
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * API Error class
 */
export class APIError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'APIError'
  }
}

/**
 * Sync Error class
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
 * Source Not Found Error
 */
export class SourceNotFoundError extends Error {
  constructor(id: string) {
    super(`Source not found: ${id}`)
    this.name = 'SourceNotFoundError'
  }
}

/**
 * Fetch Error
 */
export class FetchError extends Error {
  constructor(
    message: string,
    public readonly source: Source
  ) {
    super(message)
    this.name = 'FetchError'
  }
}

/**
 * Validation Error
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: ValidationIssue[]
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

// ============================================================================
// Parser Types
// ============================================================================

/**
 * Parsed template structure (from EDN)
 */
export interface ParsedTemplate {
  properties: Map<string, PropertyDefinition>
  classes: Map<string, ClassDefinition>
  exportType: string
  version?: string
  pages?: PageReference[]
  blocks?: BlockDefinition[]
  rawData?: Record<string, unknown>
}

/**
 * Simplified parsed template (array-based)
 */
export interface SimpleParsedTemplate {
  classes: ClassDefinition[]
  properties: PropertyDefinition[]
  metadata?: {
    name?: string
    version?: string
    description?: string
  }
}

/**
 * Page reference in a template
 */
export interface PageReference {
  id?: UUID
  name: string
  properties?: Record<string, unknown>
}

/**
 * Block definition in a template
 */
export interface BlockDefinition {
  id?: UUID
  content?: string
  properties?: Record<string, unknown>
  children?: BlockDefinition[]
}

/**
 * Parser options
 */
export interface ParserOptions {
  collectLineInfo?: boolean
  strictUuidValidation?: boolean
  expandNamespacedMaps?: boolean
  tagHandlers?: Record<string, (val: unknown) => unknown>
  maxFileSize?: number
  useStreaming?: boolean
}

// ============================================================================
// Import Options
// ============================================================================

/**
 * Import options configuration
 */
export interface ImportOptions {
  dryRun?: boolean
  onProgress?: (progress: ImportProgress) => void
  conflictStrategy?: ConflictResolution
  validate?: boolean
}

// Re-export converters
export * from './converters'
