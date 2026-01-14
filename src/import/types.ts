/**
 * Import module type definitions
 * Defines types for the ontology import workflow
 */

/**
 * Class definition representing an ontology class
 */
export interface ClassDefinition {
  name: string
  namespace?: string
  parent?: string
  description?: string
  properties?: string[]
}

/**
 * Property definition for ontology properties
 */
export interface PropertyDefinition {
  name: string
  namespace?: string
  type: string
  description?: string
  cardinality?: 'one' | 'many'
  required?: boolean
}

/**
 * Represents an update to an existing class
 */
export interface ClassUpdate {
  name: string
  before: Partial<ClassDefinition>
  after: Partial<ClassDefinition>
  changes: string[]
}

/**
 * Represents an update to an existing property
 */
export interface PropertyUpdate {
  name: string
  before: Partial<PropertyDefinition>
  after: Partial<PropertyDefinition>
  changes: string[]
}

/**
 * Conflict detected during import comparison
 */
export interface Conflict {
  type: 'class' | 'property'
  name: string
  reason: string
  existingValue: unknown
  newValue: unknown
  resolution?: 'overwrite' | 'skip' | 'ask'
}

/**
 * Parsed template structure
 */
export interface ParsedTemplate {
  classes: ClassDefinition[]
  properties: PropertyDefinition[]
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
  onProgress?: (progress: ImportProgress) => void
  /** Strategy for handling conflicts */
  conflictStrategy?: 'overwrite' | 'skip' | 'ask'
  /** Whether to validate before import */
  validate?: boolean
}

/**
 * Progress information during import
 */
export interface ImportProgress {
  phase: 'parsing' | 'validating' | 'comparing' | 'importing'
  current: number
  total: number
  message: string
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
 * Preview of changes that will be made
 */
export interface ImportPreview {
  newClasses: ClassDefinition[]
  updatedClasses: ClassUpdate[]
  newProperties: PropertyDefinition[]
  updatedProperties: PropertyUpdate[]
  conflicts: Conflict[]
  summary: {
    totalNew: number
    totalUpdated: number
    totalConflicts: number
  }
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
