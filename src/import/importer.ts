/**
 * Ontology Importer module
 * Coordinates the import workflow for ontology templates
 */

import { parseEdn, validateEdnTemplate } from '../parser/edn-parser'
import { logger } from '../utils/logger'
import { LogseqOntologyAPI, OntologyAPIError } from '../api/ontology-api'
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
 * Valid property types for type coercion
 */
const VALID_TYPES = ['default', 'number', 'date', 'datetime', 'checkbox', 'url', 'page', 'node']

/**
 * Represents the tagged structure from EDN namespace reader macros
 * e.g., #:user.property{...} becomes { tag: ':user.property', val: {...} }
 */
interface TaggedValue {
  tag: string
  val: Record<string, unknown>
}

/**
 * Check if a value is a tagged EDN structure (from namespace reader macros)
 */
function isTaggedValue(value: unknown): value is TaggedValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tag' in value &&
    'val' in value &&
    typeof (value as TaggedValue).tag === 'string' &&
    typeof (value as TaggedValue).val === 'object'
  )
}

/**
 * Get a value from an EDN object, checking both with and without colon prefix
 * The edn-data library may or may not strip the colon depending on configuration
 */
function getEdnValue(obj: Record<string, unknown>, key: string): unknown {
  return obj[key] ?? obj[`:${key}`]
}

/**
 * Check if the EDN data is in Logseq's native database export format
 * Native format has properties/classes as tagged objects, not arrays
 */
function isNativeLogseqFormat(data: Record<string, unknown>): boolean {
  // Check for properties/classes in both key formats
  const props = data['properties'] ?? data[':properties']
  const classes = data['classes'] ?? data[':classes']

  // Native format has tagged objects with user.property/user.class namespaces
  const hasNativeProperties = isTaggedValue(props) && props.tag.includes('user.property')
  const hasNativeClasses = isTaggedValue(classes) && classes.tag.includes('user.class')

  return hasNativeProperties || hasNativeClasses
}

/**
 * Extract the display name from a Logseq identifier
 * e.g., 'user.class/Person-abc123' -> 'Person'
 * e.g., 'Person-abc123' -> 'Person'
 */
function extractDisplayName(identifier: string): string {
  // Remove namespace prefix if present (e.g., 'user.class/')
  const parts = identifier.split('/')
  const withoutNamespace = parts[parts.length - 1] ?? identifier

  // Remove the unique ID suffix (e.g., '-abc123')
  // The pattern is: Name-uniqueId where uniqueId is alphanumeric
  const match = withoutNamespace.match(/^(.+?)-[A-Za-z0-9_-]+$/)
  return match?.[1] ?? withoutNamespace
}

/**
 * Extract description from nested build/properties structure
 */
function extractDescription(buildProps: unknown): string | undefined {
  if (!buildProps || typeof buildProps !== 'object') return undefined

  // Handle tagged value structure (e.g., #:logseq.property{...})
  const props = isTaggedValue(buildProps) ? buildProps.val : (buildProps as Record<string, unknown>)

  // Look for description in various formats
  const desc =
    props['logseq.property/description'] || props['description'] || props[':logseq.property/description']

  return typeof desc === 'string' ? desc : undefined
}

/**
 * Parse Logseq's native database export format for properties
 */
function parseNativeProperties(
  propsData: TaggedValue
): PropertyDefinition[] {
  const properties: PropertyDefinition[] = []

  for (const [_key, value] of Object.entries(propsData.val)) {
    if (typeof value !== 'object' || value === null) continue

    const prop = value as Record<string, unknown>

    // Get property name from block/title
    const name = prop['block/title']
    if (typeof name !== 'string' || !name) continue

    // Get cardinality - format is 'db.cardinality/one' or 'db.cardinality/many'
    const cardinalityRaw = prop['db/cardinality']
    const cardinality =
      typeof cardinalityRaw === 'string' && cardinalityRaw.includes('many') ? 'many' : 'one'

    // Get type - format is 'default', 'number', etc.
    const typeRaw = prop['logseq.property/type']
    const typeStr = typeof typeRaw === 'string' ? typeRaw : 'default'
    const type = VALID_TYPES.includes(typeStr)
      ? (typeStr as import('../types').PropertySchemaType)
      : 'default'

    // Get description from nested build/properties
    const description = extractDescription(prop['build/properties'])

    properties.push({
      name,
      type,
      cardinality,
      description,
    })
  }

  return properties
}

/**
 * Parse Logseq's native database export format for classes
 */
function parseNativeClasses(classesData: TaggedValue): ClassDefinition[] {
  const classes: ClassDefinition[] = []

  for (const [_key, value] of Object.entries(classesData.val)) {
    if (typeof value !== 'object' || value === null) continue

    const cls = value as Record<string, unknown>

    // Get class name from block/title
    const name = cls['block/title']
    if (typeof name !== 'string' || !name) continue

    // Get parent class from build/class-extends
    let parent: string | undefined
    const extendsRaw = cls['build/class-extends']
    if (Array.isArray(extendsRaw) && extendsRaw.length > 0) {
      // Take the first parent (Logseq supports only single inheritance conceptually)
      const parentRef = extendsRaw[0]
      if (typeof parentRef === 'string') {
        parent = extractDisplayName(parentRef)
      }
    }

    // Get associated properties from build/class-properties
    let classProperties: string[] | undefined
    const propsRaw = cls['build/class-properties']
    if (Array.isArray(propsRaw) && propsRaw.length > 0) {
      classProperties = propsRaw
        .filter((p): p is string => typeof p === 'string')
        .map((p) => extractDisplayName(p))
    }

    // Get description from nested build/properties
    const description = extractDescription(cls['build/properties'])

    classes.push({
      name,
      parent,
      description,
      properties: classProperties,
    })
  }

  return classes
}

/**
 * Convert Logseq's native database export format to ParsedTemplate
 */
function nativeEdnToParsedTemplate(data: Record<string, unknown>): ParsedTemplate {
  const properties: PropertyDefinition[] = []
  const classes: ClassDefinition[] = []

  // Parse properties if present (check both key formats)
  const propsData = data['properties'] ?? data[':properties']
  if (isTaggedValue(propsData)) {
    logger.debug('Parsing native properties', { valKeys: Object.keys(propsData.val).length })
    properties.push(...parseNativeProperties(propsData))
    logger.debug('Parsed native properties', { count: properties.length })
  } else {
    logger.debug('Properties not found or not tagged', {
      hasProperties: propsData !== undefined,
      isTagged: isTaggedValue(propsData)
    })
  }

  // Parse classes if present (check both key formats)
  const classesData = data['classes'] ?? data[':classes']
  if (isTaggedValue(classesData)) {
    logger.debug('Parsing native classes', { valKeys: Object.keys(classesData.val).length })
    classes.push(...parseNativeClasses(classesData))
    logger.debug('Parsed native classes', { count: classes.length })
  } else {
    logger.debug('Classes not found or not tagged', {
      hasClasses: classesData !== undefined,
      isTagged: isTaggedValue(classesData)
    })
  }

  const result = {
    classes,
    properties,
    metadata: {
      name: data['name'] ? String(data['name']) : 'Logseq Export',
      description: 'Imported from Logseq database export',
    },
  }

  logger.info('Native template parsed', {
    classCount: classes.length,
    propertyCount: properties.length,
  })

  return result
}

/**
 * Convert parsed EDN to ParsedTemplate structure
 * Automatically detects and handles both simplified template format and native Logseq format
 */
function ednToParsedTemplate(data: Record<string, unknown>): ParsedTemplate {
  // Debug: log the structure of the parsed EDN
  const topLevelKeys = Object.keys(data)
  logger.debug('Parsed EDN top-level keys', { keys: topLevelKeys })

  // Check for properties/classes in various key formats
  const propsKey = topLevelKeys.find(k => k === 'properties' || k === ':properties')
  const classesKey = topLevelKeys.find(k => k === 'classes' || k === ':classes')
  logger.debug('Found keys', { propsKey, classesKey })

  if (propsKey) {
    const propsVal = data[propsKey]
    logger.debug('Properties value type', {
      type: typeof propsVal,
      isArray: Array.isArray(propsVal),
      isTagged: isTaggedValue(propsVal),
      sample: propsVal ? JSON.stringify(propsVal).slice(0, 200) : 'null'
    })
  }

  // Check if this is native Logseq format and use appropriate parser
  if (isNativeLogseqFormat(data)) {
    logger.debug('Detected native Logseq format')
    return nativeEdnToParsedTemplate(data)
  }

  logger.debug('Using simplified template format parser')

  // Original simplified template format
  const classes: ClassDefinition[] = []
  const properties: PropertyDefinition[] = []

  // Find the actual key (could be 'classes' or ':classes' depending on EDN parser config)
  const classesData = data['classes'] ?? data[':classes']
  const propertiesData = data['properties'] ?? data[':properties']

  logger.debug('Extracting from keys', {
    hasClasses: classesData !== undefined,
    isClassesArray: Array.isArray(classesData),
    hasProperties: propertiesData !== undefined,
    isPropertiesArray: Array.isArray(propertiesData),
  })

  // Extract classes
  if (Array.isArray(classesData)) {
    for (const cls of classesData) {
      if (typeof cls === 'object' && cls !== null) {
        const c = cls as Record<string, unknown>
        const name = getEdnValue(c, 'name')
        const namespace = getEdnValue(c, 'namespace')
        const parent = getEdnValue(c, 'parent')
        const description = getEdnValue(c, 'description')
        const clsProperties = getEdnValue(c, 'properties')

        classes.push({
          name: String(name || ''),
          namespace: namespace ? String(namespace) : undefined,
          parent: parent ? String(parent) : undefined,
          description: description ? String(description) : undefined,
          properties: Array.isArray(clsProperties) ? clsProperties.map(String) : undefined,
        })
      }
    }
  }

  // Extract properties
  if (Array.isArray(propertiesData)) {
    for (const prop of propertiesData) {
      if (typeof prop === 'object' && prop !== null) {
        const p = prop as Record<string, unknown>
        const name = getEdnValue(p, 'name')
        const namespace = getEdnValue(p, 'namespace')
        const propType = getEdnValue(p, 'type')
        const description = getEdnValue(p, 'description')
        const cardinality = getEdnValue(p, 'cardinality')
        const required = getEdnValue(p, 'required')

        const typeStr = String(propType || 'default')
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
          name: String(name || ''),
          namespace: namespace ? String(namespace) : undefined,
          type,
          description: description ? String(description) : undefined,
          cardinality: cardinality === 'many' ? 'many' : 'one',
          required: Boolean(required),
        })
      }
    }
  }

  const result = {
    classes,
    properties,
    metadata: {
      name: data['name'] ? String(data['name']) : undefined,
      version: data['version'] ? String(data['version']) : undefined,
      description: data['description'] ? String(data['description']) : undefined,
    },
  }

  logger.info('Parsed template result', {
    classCount: result.classes.length,
    propertyCount: result.properties.length,
    metadata: result.metadata,
  })

  return result
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
   * Small delay helper to avoid overwhelming Logseq's API
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
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
    let skipped = 0
    const errors: Array<{ name: string; error: string }> = []

    // Track properties that were successfully created by this plugin
    // Only these can be linked to classes (Logseq ownership restriction)
    const createdProperties = new Set<string>()

    // Helper to normalize property name for comparison
    const normalizePropertyName = (name: string): string => name.toLowerCase().replace(/\s+/g, '-')

    // Helper to check if error is a duplicate or ownership restricted (should be skipped, not treated as error)
    const isDuplicateError = (error: unknown): boolean => {
      if (error instanceof OntologyAPIError) {
        // Use the isDuplicate() method which covers DUPLICATE_*, and PLUGIN_OWNERSHIP_RESTRICTED
        return error.isDuplicate()
      }
      // Also check error message for common patterns
      const message = error instanceof Error ? error.message : String(error)
      return (
        message.includes('already exists') ||
        message.includes('Plugins can only upsert its own properties')
      )
    }

    // Create new properties (with small delay between each to avoid rate limiting)
    for (const prop of preview.newProperties) {
      try {
        const apiProp: APIPropertyDefinition = {
          name: prop.name,
          type: (prop.type as APIPropertyDefinition['type']) || 'default',
          cardinality: prop.cardinality || 'one',
          description: prop.description,
        }
        logger.debug('Creating property:', { name: prop.name, type: apiProp.type })
        await this.api.createProperty(apiProp)
        propertiesApplied++
        // Track this property as successfully created (normalized name)
        createdProperties.add(normalizePropertyName(prop.name))
        // Small delay to allow Logseq to process
        await this.delay(50)
      } catch (error) {
        if (isDuplicateError(error)) {
          // Property exists or is owned by another source - skip it
          const reason =
            error instanceof OntologyAPIError && error.code === 'PLUGIN_OWNERSHIP_RESTRICTED'
              ? 'owned by another source'
              : 'already exists'
          logger.debug(`Property ${reason}, skipping: ${prop.name}`)
          skipped++
        } else {
          const message = error instanceof Error ? error.message : String(error)
          logger.error(`Failed to create property: ${prop.name}`, error)
          errors.push({ name: prop.name, error: message })
        }
      }
    }

    // Update existing properties
    for (const update of preview.updatedProperties) {
      try {
        await this.api.updateProperty(update.name, {
          type: update.after.type as APIPropertyDefinition['type'],
          cardinality: update.after.cardinality,
          description: update.after.description,
        })
        propertiesApplied++
        await this.delay(50)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Failed to update property: ${update.name}`, error)
        errors.push({ name: update.name, error: message })
      }
    }

    // Create new classes
    for (const cls of preview.newClasses) {
      try {
        // Filter properties to only include those created by this plugin
        // Logseq won't allow linking to properties owned by other sources
        let filteredProperties: string[] | undefined = undefined
        if (cls.properties && cls.properties.length > 0) {
          filteredProperties = cls.properties.filter((propName) =>
            createdProperties.has(normalizePropertyName(propName))
          )
          if (filteredProperties.length < cls.properties.length) {
            const skippedProps = cls.properties.length - filteredProperties.length
            logger.debug(
              `Class "${cls.name}": ${skippedProps} property reference(s) skipped (not owned by this plugin)`
            )
          }
          // Don't pass empty array - use undefined instead
          if (filteredProperties.length === 0) {
            filteredProperties = undefined
          }
        }

        const apiClass: APIClassDefinition = {
          name: cls.name,
          parent: cls.parent,
          description: cls.description,
          properties: filteredProperties,
        }
        logger.debug('Creating class:', { name: cls.name, propertyCount: filteredProperties?.length ?? 0 })
        await this.api.createClass(apiClass)
        classesApplied++
        await this.delay(50)
      } catch (error) {
        if (isDuplicateError(error)) {
          logger.debug(`Class already exists, skipping: ${cls.name}`)
          skipped++
        } else {
          const message = error instanceof Error ? error.message : String(error)
          logger.error(`Failed to create class: ${cls.name}`, error)
          errors.push({ name: cls.name, error: message })
        }
      }
    }

    // Update existing classes
    for (const update of preview.updatedClasses) {
      try {
        // Filter properties to only include those created by this plugin
        let filteredProperties: string[] | undefined = undefined
        if (update.after.properties && update.after.properties.length > 0) {
          filteredProperties = update.after.properties.filter((propName) =>
            createdProperties.has(normalizePropertyName(propName))
          )
          if (filteredProperties.length === 0) {
            filteredProperties = undefined
          }
        }

        await this.api.updateClass(update.name, {
          parent: update.after.parent,
          description: update.after.description,
          properties: filteredProperties,
        })
        classesApplied++
        await this.delay(50)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Failed to update class: ${update.name}`, error)
        errors.push({ name: update.name, error: message })
      }
    }

    // Log any errors that occurred
    if (errors.length > 0) {
      logger.warn('Some operations failed during import', { errors })
    }

    if (skipped > 0) {
      logger.info(`Skipped ${skipped} item(s) that already exist`)
    }

    logger.info('Changes applied', {
      classes: classesApplied,
      properties: propertiesApplied,
      skipped,
      errorCount: errors.length,
    })

    // If all operations failed (excluding skipped items), throw an error
    // But if items were skipped, that's fine - they already exist
    if (propertiesApplied === 0 && classesApplied === 0 && skipped === 0 && errors.length > 0) {
      throw new Error(`All import operations failed: ${errors[0]?.error || 'Unknown error'}`)
    }

    return {
      classes: classesApplied,
      properties: propertiesApplied,
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
