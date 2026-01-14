/**
 * Ontology Importer module
 * Coordinates the import workflow for ontology templates
 */

import { parseEdn, validateEdnTemplate } from '../parser/edn-parser'
import { logger } from '../utils/logger'
import { LogseqOntologyAPI } from '../api/ontology-api'
import type {
  PropertyDefinition as APIPropertyDefinition,
  ClassDefinition as APIClassDefinition,
} from '../api/types'
import { diffTemplate, createEmptyOntology } from './diff'
import type {
  ImportOptions,
  ImportProgress,
  ImportResult,
  ImportPreview,
  ImportError,
  ParsedTemplate,
  ExistingOntology,
  ClassDefinition,
  PropertyDefinition,
} from './types'

/**
 * Default import options
 */
const defaultOptions: Required<ImportOptions> = {
  dryRun: false,
  onProgress: () => {},
  conflictStrategy: 'ask',
  validate: true,
}

/**
 * Valid property types for Logseq
 */
const VALID_PROPERTY_TYPES = [
  'default',
  'number',
  'date',
  'datetime',
  'checkbox',
  'url',
  'page',
  'node',
]

/**
 * Validation result for import templates
 */
interface ImportValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validate an import template structure
 * Provides detailed validation of property types, cardinality, and class structure
 */
function validateImportTemplate(template: ParsedTemplate): ImportValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate properties
  for (const prop of template.properties) {
    if (!prop.name || prop.name.trim() === '') {
      errors.push('Property is missing a name')
      continue
    }

    if (!prop.type) {
      warnings.push(`Property "${prop.name}" is missing type, defaulting to "default"`)
    } else if (!VALID_PROPERTY_TYPES.includes(prop.type)) {
      errors.push(
        `Property "${prop.name}" has invalid type "${prop.type}". ` +
          `Valid types: ${VALID_PROPERTY_TYPES.join(', ')}`
      )
    }

    if (prop.cardinality && !['one', 'many'].includes(prop.cardinality)) {
      errors.push(
        `Property "${prop.name}" has invalid cardinality "${prop.cardinality}". ` +
          `Valid values: one, many`
      )
    }
  }

  // Validate classes
  for (const cls of template.classes) {
    if (!cls.name || cls.name.trim() === '') {
      errors.push('Class is missing a name')
      continue
    }

    // Check for self-referential parent
    if (cls.parent && cls.parent === cls.name) {
      errors.push(`Class "${cls.name}" cannot be its own parent`)
    }
  }

  // Check for duplicate names
  const propNames = new Set<string>()
  for (const prop of template.properties) {
    if (prop.name && propNames.has(prop.name)) {
      warnings.push(`Duplicate property name: "${prop.name}"`)
    }
    if (prop.name) propNames.add(prop.name)
  }

  const classNames = new Set<string>()
  for (const cls of template.classes) {
    if (cls.name && classNames.has(cls.name)) {
      warnings.push(`Duplicate class name: "${cls.name}"`)
    }
    if (cls.name) classNames.add(cls.name)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Convert parsed EDN to ParsedTemplate structure
 */
function ednToParsedTemplate(data: Record<string, unknown>): ParsedTemplate {
  const classes: ClassDefinition[] = []
  const properties: PropertyDefinition[] = []

  // Extract classes
  if (Array.isArray(data['classes'])) {
    for (const cls of data['classes']) {
      if (typeof cls === 'object' && cls !== null) {
        const c = cls as Record<string, unknown>
        classes.push({
          name: String(c['name'] || ''),
          namespace: c['namespace'] ? String(c['namespace']) : undefined,
          parent: c['parent'] ? String(c['parent']) : undefined,
          description: c['description'] ? String(c['description']) : undefined,
          properties: Array.isArray(c['properties']) ? c['properties'].map(String) : undefined,
        })
      }
    }
  }

  // Extract properties
  if (Array.isArray(data['properties'])) {
    for (const prop of data['properties']) {
      if (typeof prop === 'object' && prop !== null) {
        const p = prop as Record<string, unknown>
        const typeStr = String(p['type'] || 'default')
        // Validate and coerce type to PropertySchemaType
        const validTypes = [
          'default',
          'number',
          'date',
          'datetime',
          'checkbox',
          'url',
          'page',
          'node',
        ]
        const type = validTypes.includes(typeStr)
          ? (typeStr as import('../types').PropertySchemaType)
          : 'default'

        properties.push({
          name: String(p['name'] || ''),
          namespace: p['namespace'] ? String(p['namespace']) : undefined,
          type,
          description: p['description'] ? String(p['description']) : undefined,
          cardinality: p['cardinality'] === 'many' ? 'many' : 'one',
          required: Boolean(p['required']),
        })
      }
    }
  }

  return {
    classes,
    properties,
    metadata: {
      name: data['name'] ? String(data['name']) : undefined,
      version: data['version'] ? String(data['version']) : undefined,
      description: data['description'] ? String(data['description']) : undefined,
    },
  }
}

/**
 * OntologyImporter class
 * Handles parsing, validation, comparison, and import of ontology templates
 */
export class OntologyImporter {
  private options: Required<ImportOptions>
  private api: LogseqOntologyAPI

  constructor(options?: ImportOptions) {
    this.options = { ...defaultOptions, ...options }
    this.api = new LogseqOntologyAPI()
  }

  /**
   * Report progress to callback
   */
  private reportProgress(progress: ImportProgress): void {
    this.options.onProgress(progress)
  }

  /**
   * Parse EDN content into a template structure
   */
  private parseContent(content: string, validate: boolean = false): ParsedTemplate {
    const data = parseEdn(content)

    // Basic EDN structure validation
    const isValidEdn = validateEdnTemplate(data)
    if (!isValidEdn) {
      throw new Error('Template validation failed: invalid EDN structure')
    }

    const template = ednToParsedTemplate(data as unknown as Record<string, unknown>)

    // Full template validation if requested
    if (validate) {
      const validation = validateImportTemplate(template)

      // Log warnings but don't fail
      if (validation.warnings.length > 0) {
        logger.warn('Template validation warnings', { warnings: validation.warnings })
      }

      // Fail on errors
      if (!validation.valid) {
        throw new Error(
          `Template validation failed:\n${validation.errors.map((e) => `  - ${e}`).join('\n')}`
        )
      }
    }

    return template
  }

  /**
   * Get existing ontology from Logseq graph
   * Uses the Logseq API to query existing properties and classes
   *
   * @throws Error if the Logseq API is not available (not in plugin context)
   * @remarks
   * This method will return an empty ontology if fetching fails due to
   * query errors (e.g., empty graph, database issues), but will throw
   * if the Logseq API itself is unavailable.
   */
  private async getExistingOntology(): Promise<ExistingOntology> {
    try {
      const [existingProperties, existingClasses] = await Promise.all([
        this.api.getExistingProperties(),
        this.api.getExistingClasses(),
      ])

      // Convert API types to import types
      const classes = new Map<string, ClassDefinition>()
      const properties = new Map<string, PropertyDefinition>()

      for (const [name, entity] of existingClasses) {
        classes.set(name, {
          name: entity.name,
          parent: entity.parent,
          properties: entity.properties,
        })
      }

      for (const [name, entity] of existingProperties) {
        properties.set(name, {
          name: entity.name,
          type: entity.type,
          cardinality: entity.cardinality,
        })
      }

      return { classes, properties }
    } catch (error) {
      // Check if this is an API availability error - these should propagate
      if (error instanceof Error && error.message.includes('not available')) {
        logger.error('Logseq API not available', error)
        throw error
      }

      // For other errors (query failures, etc.), log and return empty
      // This allows imports to proceed even if the graph is empty or has issues
      logger.warn('Failed to fetch existing ontology, proceeding with empty state', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorType: error instanceof Error ? error.name : typeof error,
      })
      return createEmptyOntology()
    }
  }

  /**
   * Apply changes to Logseq graph
   * Uses the Logseq API to create/update properties and classes
   */
  private async applyChanges(
    preview: ImportPreview
  ): Promise<{ classes: number; properties: number }> {
    logger.info('Applying changes', {
      newClasses: preview.newClasses.length,
      updatedClasses: preview.updatedClasses.length,
      newProperties: preview.newProperties.length,
      updatedProperties: preview.updatedProperties.length,
    })

    let classesApplied = 0
    let propertiesApplied = 0

    // Start a transaction for atomic operations
    await this.api.beginTransaction()

    try {
      // Create new properties
      for (const prop of preview.newProperties) {
        const apiProp: APIPropertyDefinition = {
          name: prop.name,
          type: (prop.type as APIPropertyDefinition['type']) || 'default',
          cardinality: prop.cardinality || 'one',
          description: prop.description,
        }
        await this.api.createProperty(apiProp)
        propertiesApplied++
      }

      // Update existing properties
      for (const update of preview.updatedProperties) {
        await this.api.updateProperty(update.name, {
          type: update.after.type as APIPropertyDefinition['type'],
          cardinality: update.after.cardinality,
          description: update.after.description,
        })
        propertiesApplied++
      }

      // Create new classes
      for (const cls of preview.newClasses) {
        const apiClass: APIClassDefinition = {
          name: cls.name,
          parent: cls.parent,
          description: cls.description,
          properties: cls.properties,
        }
        await this.api.createClass(apiClass)
        classesApplied++
      }

      // Update existing classes
      for (const update of preview.updatedClasses) {
        await this.api.updateClass(update.name, {
          parent: update.after.parent,
          description: update.after.description,
          properties: update.after.properties,
        })
        classesApplied++
      }

      // Commit the transaction
      await this.api.commitTransaction()

      logger.info('Changes applied successfully', {
        classes: classesApplied,
        properties: propertiesApplied,
      })

      return {
        classes: classesApplied,
        properties: propertiesApplied,
      }
    } catch (error) {
      // Rollback on error
      await this.api.rollbackTransaction()
      throw error
    }
  }

  /**
   * Generate a preview of changes without applying them
   */
  async preview(content: string): Promise<ImportPreview> {
    this.reportProgress({
      phase: 'parsing',
      current: 0,
      total: 3,
      message: 'Parsing template...',
    })

    // Parse and optionally validate in one step
    const template = this.parseContent(content, this.options.validate)

    this.reportProgress({
      phase: 'validating',
      current: 1,
      total: 3,
      message: 'Validation complete',
    })

    this.reportProgress({
      phase: 'comparing',
      current: 2,
      total: 3,
      message: 'Comparing with existing ontology...',
    })

    const existing = await this.getExistingOntology()
    const preview = diffTemplate(template, existing)

    this.reportProgress({
      phase: 'comparing',
      current: 3,
      total: 3,
      message: 'Preview complete',
    })

    return preview
  }

  /**
   * Import a template into Logseq
   */
  async import(content: string, options?: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now()
    const opts = { ...this.options, ...options }
    const errors: ImportError[] = []

    try {
      // Generate preview first
      const preview = await this.preview(content)

      // Check for unresolved conflicts
      if (preview.conflicts.length > 0 && opts.conflictStrategy === 'ask') {
        return {
          success: false,
          preview,
          applied: { classes: 0, properties: 0 },
          errors: [
            {
              code: 'UNRESOLVED_CONFLICTS',
              message: `${preview.conflicts.length} conflict(s) require resolution`,
            },
          ],
          duration: Date.now() - startTime,
          dryRun: opts.dryRun,
        }
      }

      // If dry run, don't apply changes
      if (opts.dryRun) {
        return {
          success: true,
          preview,
          applied: { classes: 0, properties: 0 },
          errors: [],
          duration: Date.now() - startTime,
          dryRun: true,
        }
      }

      // Apply changes
      this.reportProgress({
        phase: 'importing',
        current: 0,
        total: 1,
        message: 'Applying changes...',
      })

      const applied = await this.applyChanges(preview)

      this.reportProgress({
        phase: 'importing',
        current: 1,
        total: 1,
        message: 'Import complete',
      })

      return {
        success: true,
        preview,
        applied,
        errors,
        duration: Date.now() - startTime,
        dryRun: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push({
        code: 'IMPORT_FAILED',
        message,
      })

      return {
        success: false,
        preview: {
          newClasses: [],
          updatedClasses: [],
          newProperties: [],
          updatedProperties: [],
          classesToRemove: [],
          propertiesToRemove: [],
          conflicts: [],
          summary: { totalNew: 0, totalUpdated: 0, totalRemoved: 0, totalConflicts: 0 },
        },
        applied: { classes: 0, properties: 0 },
        errors,
        duration: Date.now() - startTime,
        dryRun: opts.dryRun,
      }
    }
  }
}
