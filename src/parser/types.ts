/**
 * Type definitions for EDN Parser module
 * Handles Logseq ontology template structures
 */

import type { EDNObjectableVal, EDNVal, EDNTaggedVal, EDNKeyword } from 'edn-data'

// Re-export edn-data types for convenience
export type { EDNObjectableVal, EDNVal, EDNTaggedVal, EDNKeyword }

/**
 * UUID representation from EDN tagged values
 */
export interface UUID {
  uuid: string
}

/**
 * Property schema types supported by Logseq
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
 * Property cardinality
 */
export type PropertyCardinality = 'one' | 'many'

/**
 * Property definition from Logseq ontology
 */
export interface PropertyDefinition {
  /** Unique identifier */
  id: UUID
  /** Property name/title */
  name: string
  /** Original namespaced keyword (e.g., :property/name) */
  originalKey?: string
  /** Schema type */
  type: PropertySchemaType
  /** Cardinality */
  cardinality: PropertyCardinality
  /** Description of the property */
  description?: string
  /** Whether this property is a closed value (enum) */
  closed?: boolean
  /** Allowed values for closed properties */
  closedValues?: ClosedValue[]
  /** Position/order in templates */
  position?: string
  /** Hide property from UI */
  hide?: boolean
  /** Associated classes (for node type) */
  classes?: UUID[]
  /** Raw EDN data for any extra fields */
  rawData?: Record<string, unknown>
}

/**
 * Closed value definition (enum values)
 */
export interface ClosedValue {
  id: UUID
  value: string
  icon?: string
  description?: string
  rawData?: Record<string, unknown>
}

/**
 * Class definition from Logseq ontology
 */
export interface ClassDefinition {
  /** Unique identifier */
  id: UUID
  /** Class name/title */
  name: string
  /** Original namespaced keyword (e.g., :class/Person) */
  originalKey?: string
  /** Description of the class */
  description?: string
  /** Parent class references */
  parents?: UUID[]
  /** Properties associated with this class */
  properties?: UUID[]
  /** Position/order in templates */
  position?: string
  /** Raw EDN data for any extra fields */
  rawData?: Record<string, unknown>
}

/**
 * Page/block reference
 */
export interface PageReference {
  id: UUID
  name: string
  properties?: Record<string, unknown>
  rawData?: Record<string, unknown>
}

/**
 * Block definition
 */
export interface BlockDefinition {
  id: UUID
  content?: string
  properties?: Record<string, unknown>
  children?: BlockDefinition[]
  rawData?: Record<string, unknown>
}

/**
 * Parsed template structure
 */
export interface ParsedTemplate {
  /** Properties defined in the template */
  properties: Map<string, PropertyDefinition>
  /** Classes defined in the template */
  classes: Map<string, ClassDefinition>
  /** Export type identifier */
  exportType: string
  /** Version information */
  version?: string
  /** Page references */
  pages?: PageReference[]
  /** Block definitions */
  blocks?: BlockDefinition[]
  /** Raw parsed data for reference */
  rawData?: Record<string, unknown>
}

/**
 * Validation severity levels
 */
export type ValidationSeverity = 'error' | 'warning' | 'info'

/**
 * Single validation issue
 */
export interface ValidationIssue {
  /** Severity of the issue */
  severity: ValidationSeverity
  /** Error/warning code */
  code: string
  /** Human-readable message */
  message: string
  /** Path to the problematic field */
  path?: string
  /** Line number in source (if available) */
  line?: number
  /** Column number in source (if available) */
  column?: number
  /** Suggested fix */
  suggestion?: string
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean
  /** List of issues found */
  issues: ValidationIssue[]
  /** Summary statistics */
  stats: ValidationStats
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

/**
 * Parser options
 */
export interface ParserOptions {
  /** Whether to collect line numbers (slower but better errors) */
  collectLineInfo?: boolean
  /** Whether to validate UUIDs strictly */
  strictUuidValidation?: boolean
  /** Whether to expand namespaced maps */
  expandNamespacedMaps?: boolean
  /** Custom tag handlers */
  tagHandlers?: Record<string, (val: unknown) => unknown>
  /** Maximum file size in bytes (default 50MB) */
  maxFileSize?: number
  /** Whether to use streaming for large files */
  useStreaming?: boolean
}

/**
 * Parse error with location information
 */
export class ParseError extends Error {
  public readonly code: string
  public readonly line?: number
  public readonly column?: number
  public readonly source?: string

  constructor(
    message: string,
    code: string,
    options?: { line?: number; column?: number; source?: string }
  ) {
    super(message)
    this.name = 'ParseError'
    this.code = code
    this.line = options?.line
    this.column = options?.column
    this.source = options?.source
  }

  toString(): string {
    let result = `${this.name} [${this.code}]: ${this.message}`
    if (this.line !== undefined) {
      result += ` at line ${this.line}`
      if (this.column !== undefined) {
        result += `, column ${this.column}`
      }
    }
    return result
  }
}

/**
 * Validation error
 */
export class ValidationError extends Error {
  public readonly issues: ValidationIssue[]

  constructor(message: string, issues: ValidationIssue[]) {
    super(message)
    this.name = 'ValidationError'
    this.issues = issues
  }
}

/**
 * Raw EDN data structure (generic object form)
 */
export interface EdnData {
  [key: string]: EDNObjectableVal
}

/**
 * Type guard for UUID tagged values
 */
export function isUUID(value: unknown): value is UUID {
  return (
    typeof value === 'object' &&
    value !== null &&
    'uuid' in value &&
    typeof (value as UUID).uuid === 'string'
  )
}

/**
 * Type guard for EDN tagged values
 */
export function isEDNTaggedVal(value: unknown): value is EDNTaggedVal {
  return typeof value === 'object' && value !== null && 'tag' in value && 'val' in value
}

/**
 * Type guard for EDN keyword
 */
export function isEDNKeyword(value: unknown): value is EDNKeyword {
  return typeof value === 'object' && value !== null && 'key' in value
}

/**
 * UUID validation regex (standard UUID format)
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
