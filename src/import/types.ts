/**
 * Import module type definitions
 *
 * Re-exports unified types for the ontology import workflow.
 * Module-specific types are defined here.
 *
 * @module import/types
 */

// Re-export core types from unified type system
export type {
  PropertyDefinition,
  ClassDefinition,
  ClassUpdate,
  PropertyUpdate,
  Conflict,
  ConflictResolution,
  ImportPreview,
  ImportProgress,
  ImportError,
  ImportResult,
  ExistingOntology,
} from '../types'

/**
 * Parsed template structure
 *
 * @remarks
 * This is import-module specific as it represents the structure
 * of a parsed EDN template file.
 */
export interface ParsedTemplate {
  classes: import('../types').ClassDefinition[]
  properties: import('../types').PropertyDefinition[]
  metadata?: {
    name?: string
    version?: string
    description?: string
  }
}

/**
 * Import options configuration
 */
export interface ImportOptions {
  /** Run without making changes */
  dryRun?: boolean
  /** Progress callback */
  onProgress?: (progress: import('../types').ImportProgress) => void
  /** Strategy for handling conflicts */
  conflictStrategy?: import('../types').ConflictResolution
  /** Whether to validate before import */
  validate?: boolean
}
