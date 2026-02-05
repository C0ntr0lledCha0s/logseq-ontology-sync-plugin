/**
 * Logseq Ontology API
 *
 * High-level API for managing ontology classes and properties in Logseq.
 *
 * @remarks
 * This API wraps the Logseq Plugin API to provide ontology-specific operations.
 *
 * ## Batch Operations (Non-Atomic)
 *
 * **IMPORTANT:** Batch operations do NOT provide true atomicity or transactions.
 * If operation 3 of 5 fails:
 * - Operations 1-2 are ALREADY persisted and will NOT be rolled back
 * - Operations 4-5 will NOT be executed
 * - The result will include `appliedItems` for manual cleanup if needed
 *
 * For operations that must succeed or fail together, consider:
 * - Validating all data before starting the batch
 * - Implementing application-level rollback using the `appliedItems` list
 * - Using dry-run mode to preview changes first
 *
 * ## Deprecated Transaction API
 *
 * The legacy transaction methods (`beginTransaction`, `commitTransaction`,
 * `rollbackTransaction`) are deprecated and internally use the batch API.
 * The `rollbackTransaction` method does NOT actually undo changes - it only
 * cancels pending operations. Use the batch API directly for new code.
 */

import { logger } from '../utils/logger'
import { executeQuery, QUERY_ALL_PROPERTIES, QUERY_ALL_CLASSES } from './queries'
import { isLogseqAvailable, getLogseqAPI } from './logseq-types'
import type { LogseqBlock } from './logseq-types'
import type {
  PropertyDefinition,
  PropertyEntity,
  PropertyValueType,
  PropertyCardinality,
  ClassDefinition,
  ClassEntity,
} from './types'

// ============================================================================
// Types
// ============================================================================

/**
 * Progress callback for batch operations
 */
export type ProgressCallback = (progress: {
  current: number
  total: number
  percentage: number
}) => void

/**
 * Result of a batch operation
 *
 * @remarks
 * Batch operations are NOT atomic. If an operation fails, previous
 * operations will have already been applied and will NOT be rolled back.
 */
export interface BatchResult {
  total: number
  succeeded: number
  failed: number
  errors: Array<{ index: number; item: string; error: string }>
  /** IDs of successfully created/updated items (for potential manual rollback) */
  appliedItems: string[]
}

/**
 * Batch operation tracking
 */
interface PendingBatch {
  id: string
  operations: BatchOperation[]
  status: 'pending' | 'executing' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  appliedItems: string[]
}

/**
 * Single operation in a batch
 */
export interface BatchOperation {
  type:
    | 'createProperty'
    | 'updateProperty'
    | 'deleteProperty'
    | 'createClass'
    | 'updateClass'
    | 'deleteClass'
  name: string
  data?:
    | PropertyDefinition
    | ClassDefinition
    | Partial<PropertyDefinition>
    | Partial<ClassDefinition>
}

/**
 * API error with code and details
 */
export class OntologyAPIError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'OntologyAPIError'
  }

  /**
   * Check if this error indicates the entity already exists or cannot be modified
   * This includes both explicit duplicates and plugin ownership restrictions
   */
  isDuplicate(): boolean {
    return (
      this.code === 'DUPLICATE_PROPERTY' ||
      this.code === 'DUPLICATE_CLASS' ||
      this.code === 'PLUGIN_OWNERSHIP_RESTRICTED'
    )
  }
}

/**
 * Check if an error is a Logseq plugin ownership restriction
 * This occurs when a plugin tries to modify properties/classes it didn't create
 */
function isPluginOwnershipError(error: unknown): boolean {
  if (!error) return false

  const searchString = 'Plugins can only upsert its own properties'

  // Check Error instance
  if (error instanceof Error) {
    return error.message.includes(searchString)
  }

  // Check string
  if (typeof error === 'string') {
    return error.includes(searchString)
  }

  // Check plain object with message property (common Logseq error format)
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>

    // Direct message property check (most reliable for Logseq errors)
    if (typeof obj.message === 'string' && obj.message.includes(searchString)) {
      return true
    }

    // Fallback: try to stringify (may fail on circular refs)
    try {
      const jsonStr = JSON.stringify(error)
      return jsonStr.includes(searchString)
    } catch {
      // Stringify failed, check nested properties manually
      return false
    }
  }

  return false
}

// ============================================================================
// Safe API Call Wrapper
// ============================================================================

/**
 * Check if an error is a DataCloneError from postMessage serialization
 *
 * Logseq's plugin API uses postMessage for IPC. Some API methods return
 * objects containing functions or circular references that can't be
 * serialized. This causes DataCloneError, but the actual operation succeeds.
 */
function isDataCloneError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'DataCloneError' || error.message.includes('could not be cloned')
  }
  if (typeof error === 'string') {
    return error.includes('DataCloneError') || error.includes('could not be cloned')
  }
  return false
}

/**
 * Safely call a Logseq API method that may return non-serializable data
 *
 * Some Logseq APIs (addTagProperty, addTagExtends, upsertBlockProperty)
 * return values that contain functions or circular references. When these
 * are serialized for postMessage IPC, they cause DataCloneError. However,
 * the actual operation succeeds - only the return value serialization fails.
 *
 * This wrapper catches DataCloneError and returns undefined instead of
 * letting the error propagate as an uncaught promise rejection.
 *
 * @param apiCall - Promise from a Logseq API call
 * @param context - Description for logging purposes
 * @returns The result, or undefined if DataCloneError occurred
 */
async function safeApiCall<T>(apiCall: Promise<T>, context: string): Promise<T | undefined> {
  try {
    return await apiCall
  } catch (error) {
    if (isDataCloneError(error)) {
      // Operation succeeded but return value couldn't be serialized
      // This is expected for some Logseq APIs - log at debug level
      logger.debug(`API call succeeded but result not serializable: ${context}`)
      return undefined
    }
    throw error
  }
}

// ============================================================================
// Icon Support
// ============================================================================

/**
 * Set a Tabler icon on an entity (property, tag, or block)
 *
 * @remarks
 * Only Tabler icons are supported via the plugin API. Emoji icons fail
 * because Logseq's internal emoji lookup table is not accessible to plugins.
 * (Discovery: Feb 2025)
 *
 * @param uuid - The entity UUID
 * @param icon - The icon identifier
 * @param iconType - The icon type ('tabler-icon' or 'emoji')
 * @param entityDescription - Description for logging (e.g., "property 'my-prop'")
 * @returns true if icon was set, false if skipped (emoji or no icon)
 */
async function setTablerIcon(
  uuid: string,
  icon: string | undefined,
  iconType: 'emoji' | 'tabler-icon' | undefined,
  entityDescription: string
): Promise<boolean> {
  // Skip if no icon provided
  if (!icon) {
    return false
  }

  // Only Tabler icons are supported - emoji icons fail with lookup errors
  if (iconType !== 'tabler-icon') {
    logger.debug(`Skipping icon for ${entityDescription}: emoji icons not supported via API`, {
      icon,
      iconType: iconType || 'unknown',
    })
    return false
  }

  if (!isLogseqAvailable()) {
    logger.warn(`Cannot set icon for ${entityDescription}: Logseq API not available`)
    return false
  }

  const api = getLogseqAPI()

  // Type for Editor with setBlockIcon
  type EditorWithIcon = typeof api.Editor & {
    setBlockIcon?: (
      blockId: string,
      iconType: 'tabler-icon' | 'emoji',
      iconName: string
    ) => Promise<void>
  }

  const editor = api.Editor as EditorWithIcon

  if (!editor.setBlockIcon) {
    logger.debug(`setBlockIcon API not available, skipping icon for ${entityDescription}`)
    return false
  }

  try {
    await safeApiCall(
      editor.setBlockIcon(uuid, 'tabler-icon', icon),
      `setBlockIcon('tabler-icon', '${icon}') for ${entityDescription}`
    )
    logger.info(`Set tabler icon for ${entityDescription}`, { icon })
    return true
  } catch (error) {
    logger.warn(`Could not set icon for ${entityDescription}`, {
      icon,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a property or class name
 */
function validateName(name: string, type: 'property' | 'class'): void {
  if (!name || typeof name !== 'string') {
    throw new OntologyAPIError(`${type} name is required`, 'INVALID_NAME', { name })
  }

  const trimmed = name.trim()
  if (trimmed.length === 0) {
    throw new OntologyAPIError(`${type} name cannot be empty`, 'EMPTY_NAME', { name })
  }

  if (trimmed.length > 255) {
    throw new OntologyAPIError(
      `${type} name exceeds maximum length of 255 characters`,
      'NAME_TOO_LONG',
      { name, length: trimmed.length }
    )
  }

  // Check for invalid characters (Logseq uses kebab-case)
  if (type === 'property' && !/^[a-zA-Z][a-zA-Z0-9-_ ]*$/.test(trimmed)) {
    throw new OntologyAPIError(
      `Property name must start with a letter and contain only letters, numbers, hyphens, underscores, and spaces`,
      'INVALID_NAME_FORMAT',
      { name }
    )
  }
}

/**
 * Validate property definition
 */
function validatePropertyDefinition(def: PropertyDefinition): void {
  validateName(def.name, 'property')

  const validTypes: PropertyValueType[] = [
    'default',
    'number',
    'date',
    'datetime',
    'checkbox',
    'url',
    'page',
    'node',
  ]
  if (!validTypes.includes(def.type)) {
    throw new OntologyAPIError(`Invalid property type: ${def.type}`, 'INVALID_TYPE', {
      type: def.type,
      validTypes,
    })
  }

  if (def.cardinality && !['one', 'many'].includes(def.cardinality)) {
    throw new OntologyAPIError(`Invalid cardinality: ${def.cardinality}`, 'INVALID_CARDINALITY', {
      cardinality: def.cardinality,
    })
  }
}

/**
 * Validate class definition
 *
 * @remarks
 * This validates:
 * - Class name is valid (non-empty, proper format)
 * - Parent reference is not self-referential
 * - Property references are strings (if provided)
 *
 * Note: This does NOT validate that referenced classes or properties exist
 * in the graph (that would require async API calls). Use `validateReferences`
 * for deep validation if needed.
 */
function validateClassDefinition(def: ClassDefinition): void {
  validateName(def.name, 'class')

  // Check for self-referential parent
  if (def.parent && def.parent === def.name) {
    throw new OntologyAPIError(
      `Class cannot be its own parent: ${def.name}`,
      'CIRCULAR_REFERENCE',
      { name: def.name, parent: def.parent }
    )
  }

  // Validate property references are strings
  if (def.properties) {
    if (!Array.isArray(def.properties)) {
      throw new OntologyAPIError('Class properties must be an array', 'INVALID_PROPERTIES', {
        name: def.name,
        properties: def.properties,
      })
    }
    for (const prop of def.properties) {
      if (typeof prop !== 'string') {
        throw new OntologyAPIError(
          `Class property reference must be a string: ${String(prop)}`,
          'INVALID_PROPERTY_REFERENCE',
          { name: def.name, property: prop }
        )
      }
    }
  }
}

/**
 * Type guard for PropertyDefinition
 */
function isPropertyDefinition(data: unknown): data is PropertyDefinition {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return typeof obj.name === 'string' && typeof obj.type === 'string'
}

/**
 * Type guard for ClassDefinition
 */
function isClassDefinition(data: unknown): data is ClassDefinition {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>
  return typeof obj.name === 'string'
}

/**
 * Type guard for partial property definition
 */
function isPartialPropertyDefinition(data: unknown): data is Partial<PropertyDefinition> {
  if (!data || typeof data !== 'object') return false
  return true // Partial can be any subset
}

/**
 * Type guard for partial class definition
 */
function isPartialClassDefinition(data: unknown): data is Partial<ClassDefinition> {
  if (!data || typeof data !== 'object') return false
  return true // Partial can be any subset
}

// ============================================================================
// API Class
// ============================================================================

/**
 * Logseq Ontology API
 *
 * Provides CRUD operations for managing ontology properties and classes.
 *
 * @example
 * ```typescript
 * const api = new LogseqOntologyAPI()
 *
 * // Create a property
 * const prop = await api.createProperty({
 *   name: 'my-property',
 *   type: 'default',
 *   cardinality: 'one',
 * })
 *
 * // Execute batch operations (NOT atomic!)
 * const batch = api.beginBatch()
 * api.addToBatch({ type: 'createProperty', name: 'prop1', data: {...} })
 * api.addToBatch({ type: 'createClass', name: 'Class1', data: {...} })
 * const result = await api.executeBatch()
 * ```
 */
export class LogseqOntologyAPI {
  private pendingBatch: PendingBatch | null = null

  /**
   * Create a new property in the graph
   *
   * @param def - Property definition
   * @returns Created property entity
   * @throws OntologyAPIError if validation fails or creation fails
   *
   * @remarks
   * In Logseq DB mode, properties are created using `Editor.upsertProperty()`,
   * not `createPage()` with block/type. This ensures proper typing in the database.
   */
  async createProperty(def: PropertyDefinition): Promise<PropertyEntity> {
    validatePropertyDefinition(def)

    logger.debug('Creating property', { name: def.name })

    if (!isLogseqAvailable()) {
      throw new OntologyAPIError('Logseq API not available', 'LOGSEQ_NOT_AVAILABLE')
    }

    const api = getLogseqAPI()

    // Type for the Editor with property methods
    type EditorWithProps = typeof api.Editor & {
      upsertProperty: (
        key: string,
        schema?: Record<string, unknown>,
        opts?: { name?: string }
      ) => Promise<{ id?: number } | undefined>
      getProperty?: (key: string) => Promise<{ id: number; uuid: string } | null>
      upsertBlockProperty?: (blockId: string, key: string, value: unknown) => Promise<void>
    }

    const editor = api.Editor as EditorWithProps

    try {
      // Normalize property key to kebab-case for Logseq (internal identifier)
      const normalizedKey = def.name.toLowerCase().replace(/\s+/g, '-')

      // Map our property types to Logseq's expected types
      // Logseq DB mode accepts: 'default', 'string', 'number', 'date', 'checkbox', 'url', 'node'
      const typeMap: Record<string, string> = {
        default: 'default',
        number: 'number',
        date: 'date',
        datetime: 'date', // Logseq uses 'date' for both
        checkbox: 'checkbox',
        url: 'url',
        page: 'node', // 'page' maps to 'node' in DB mode
        node: 'node',
      }
      const logseqType = typeMap[def.type] || 'default'

      // Build upsertProperty schema options
      // Logseq's upsertProperty schema supports: type, cardinality, hide, public
      const schemaOptions: Record<string, unknown> = {
        type: logseqType,
      }

      // Add cardinality if 'many'
      if (def.cardinality === 'many') {
        schemaOptions.cardinality = 'many'
      }

      // Add hide option (controls visibility in UI)
      if (def.hide !== undefined) {
        schemaOptions.hide = def.hide
      }

      // Build opts with original name to preserve casing
      // The opts.name parameter sets the display title in Logseq
      const opts: { name?: string } = {}
      if (def.title || def.name !== normalizedKey) {
        // Use title if provided, otherwise preserve original name casing
        opts.name = def.title || def.name
      }

      // Use upsertProperty for DB mode (creates if not exists, updates if exists)
      // This is the correct API for Logseq DB mode
      logger.debug('Calling upsertProperty', {
        key: normalizedKey,
        schema: schemaOptions,
        opts,
        titleSource: def.title ? 'explicit' : 'derived-from-name',
        defTitle: def.title,
        defName: def.name,
      })
      const result = await editor.upsertProperty(normalizedKey, schemaOptions, opts)

      // upsertProperty returns IEntityID (just { id }) - we need to get the actual property to get UUID
      // Query the property to get its UUID for icon and metadata operations
      let uuid: string | undefined
      if (editor.getProperty) {
        try {
          const propertyEntity = await editor.getProperty(normalizedKey)
          uuid = propertyEntity?.uuid
          logger.debug('Got property entity', { key: normalizedKey, uuid, id: propertyEntity?.id })
        } catch (getError) {
          logger.debug('Could not get property entity', {
            key: normalizedKey,
            error: getError instanceof Error ? getError.message : String(getError),
          })
        }
      }

      // Set additional metadata fields via upsertBlockProperty
      // These fields are not directly supported by upsertProperty schema
      if (uuid && editor.upsertBlockProperty) {
        const metadataFields: Array<[string, unknown, string]> = []

        // Use the full namespaced key for system description field
        // Discovery (Feb 2025): ':logseq.property/description' sets the SYSTEM description,
        // while 'description' would create a user property with that name
        if (def.description)
          metadataFields.push([uuid, def.description, ':logseq.property/description'])
        if (def.schemaVersion) metadataFields.push([uuid, def.schemaVersion, 'schema-version'])

        // Try setting the display title via :block/title
        // Discovery (Feb 2025): opts.name in upsertProperty does NOT reliably set display title
        // ':logseq.property/title' fails with an error
        // Trying ':block/title' as that's what Logseq uses internally for display names
        if (def.title) metadataFields.push([uuid, def.title, ':block/title'])

        // Set metadata via upsertBlockProperty
        for (const [blockId, value, key] of metadataFields) {
          try {
            // Use safeApiCall to handle DataCloneError from postMessage serialization
            await safeApiCall(
              editor.upsertBlockProperty(blockId, key, value),
              `upsertBlockProperty(${key}) for property "${def.name}"`
            )
            logger.info(`Set ${key} for property`, { property: def.name })
          } catch (metaError) {
            logger.warn(`Could not set ${key} for property "${def.name}"`, {
              error: metaError instanceof Error ? metaError.message : String(metaError),
            })
          }
        }

        // Set Tabler icon if provided (emoji icons not supported via API)
        if (def.icon) {
          await setTablerIcon(uuid, def.icon, def.iconType, `property "${def.name}"`)
        }
      }

      // Generate a fallback UUID if we couldn't retrieve it (shouldn't happen normally)
      const entityUuid = uuid || crypto.randomUUID()
      if (!uuid) {
        logger.warn('Could not retrieve UUID for property, using generated fallback', {
          property: def.name,
          fallbackUuid: entityUuid,
        })
      }

      const entity: PropertyEntity = {
        id: result?.id || Date.now(),
        uuid: entityUuid,
        name: normalizedKey,
        originalName: def.title || def.name,
        type: def.type,
        cardinality: def.cardinality,
        hide: def.hide ?? false,
        schemaVersion: def.schemaVersion || 1,
        classes: def.classes || [],
      }

      logger.info('Property created', { name: def.name, uuid: entity.uuid })
      return entity
    } catch (error) {
      if (error instanceof OntologyAPIError) throw error

      // Handle non-Error objects (Logseq sometimes returns plain objects or strings)
      let message: string
      if (error instanceof Error) {
        message = error.message
      } else if (typeof error === 'string') {
        message = error
      } else if (error && typeof error === 'object') {
        message = JSON.stringify(error)
      } else {
        message = 'Unknown error'
      }

      // Check for plugin ownership restriction (Logseq DB-mode security)
      // This occurs when the property already exists but wasn't created by this plugin
      if (isPluginOwnershipError(error)) {
        logger.debug(
          `Property "${def.name}" exists but is owned by another plugin or was created manually`,
          { name: def.name }
        )
        throw new OntologyAPIError(
          `Property exists but cannot be modified by this plugin: ${def.name}`,
          'PLUGIN_OWNERSHIP_RESTRICTED',
          { propertyName: def.name }
        )
      }

      logger.error('createProperty failed with raw error:', error)
      throw new OntologyAPIError(
        `Failed to create property: ${message}`,
        'CREATE_PROPERTY_FAILED',
        { propertyName: def.name, originalError: message }
      )
    }
  }

  /**
   * Update an existing property
   *
   * @param name - Property name (used as identifier)
   * @param updates - Partial property definition with fields to update
   * @throws OntologyAPIError if property not found or update fails
   *
   * @remarks
   * Properties in Logseq can be stored either on the page itself or on the first block.
   * This method attempts to update the first block if it exists, otherwise it will
   * throw an error since page-level property updates require different handling.
   */
  async updateProperty(name: string, updates: Partial<PropertyDefinition>): Promise<void> {
    validateName(name, 'property')

    // Early return if there's nothing to update
    const updateKeys = Object.keys(updates).filter(
      (k) => updates[k as keyof PropertyDefinition] !== undefined
    )
    if (updateKeys.length === 0) {
      logger.debug('No updates provided for property', { name })
      return
    }

    logger.debug('Updating property', { name, updates: updateKeys })

    if (!isLogseqAvailable()) {
      throw new OntologyAPIError('Logseq API not available', 'LOGSEQ_NOT_AVAILABLE')
    }

    const api = getLogseqAPI()

    try {
      // Verify property exists
      const page = await api.Editor.getPage(name)
      if (!page) {
        throw new OntologyAPIError(`Property not found: ${name}`, 'PROPERTY_NOT_FOUND', { name })
      }

      // Get page blocks to find where to update properties
      const blocks = await api.Editor.getPageBlocksTree(name)

      // Find a valid block to update
      // Property pages should have at least one block with a uuid
      const targetBlock = this.findValidBlock(blocks)

      if (!targetBlock) {
        // No valid blocks found - this is a structural issue
        throw new OntologyAPIError(
          `Property page "${name}" has no valid blocks to update. ` +
            `The page may be empty or have an invalid structure.`,
          'NO_VALID_BLOCKS',
          { name, blocksFound: blocks?.length ?? 0 }
        )
      }

      // Update properties on the target block
      const updatePromises: Promise<void>[] = []

      if (updates.type !== undefined) {
        updatePromises.push(
          api.Editor.upsertBlockProperty(targetBlock.uuid, 'property/schema-type', updates.type)
        )
      }
      if (updates.cardinality !== undefined) {
        updatePromises.push(
          api.Editor.upsertBlockProperty(
            targetBlock.uuid,
            'property/cardinality',
            updates.cardinality
          )
        )
      }
      if (updates.description !== undefined) {
        // Use the full namespaced key for system description field
        updatePromises.push(
          api.Editor.upsertBlockProperty(
            targetBlock.uuid,
            ':logseq.property/description',
            updates.description
          )
        )
      }
      if (updates.hide !== undefined) {
        updatePromises.push(
          api.Editor.upsertBlockProperty(targetBlock.uuid, 'property/hide?', updates.hide)
        )
      }
      // NOTE: Property title CANNOT be updated via upsertBlockProperty.
      // ':logseq.property/title' fails with an error (Discovery: Feb 2025).
      // Title can only be set during creation via upsertProperty opts.name parameter.
      if (updates.title !== undefined) {
        logger.debug('Property title update requested but not supported via API', {
          name,
          requestedTitle: updates.title,
        })
      }

      if (updatePromises.length === 0) {
        logger.debug('No applicable updates for property', { name })
        return
      }

      await Promise.all(updatePromises)

      // Set Tabler icon if provided (emoji icons not supported via API)
      // NOTE: Tabler icons work via setBlockIcon, emoji icons fail due to
      // inaccessible emoji lookup table. (Discovery: Feb 2025)
      if (updates.icon !== undefined) {
        await setTablerIcon(targetBlock.uuid, updates.icon, updates.iconType, `property "${name}"`)
      }

      logger.info('Property updated', { name, updatedFields: updateKeys })
    } catch (error) {
      if (error instanceof OntologyAPIError) throw error
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OntologyAPIError(
        `Failed to update property: ${message}`,
        'UPDATE_PROPERTY_FAILED',
        { propertyName: name, originalError: message }
      )
    }
  }

  /**
   * Delete a property
   *
   * @param name - Property name to delete
   * @throws OntologyAPIError if deletion fails
   */
  async deleteProperty(name: string): Promise<void> {
    validateName(name, 'property')

    logger.debug('Deleting property', { name })

    if (!isLogseqAvailable()) {
      throw new OntologyAPIError('Logseq API not available', 'LOGSEQ_NOT_AVAILABLE')
    }

    const api = getLogseqAPI()

    try {
      await api.Editor.deletePage(name)
      logger.info('Property deleted', { name })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OntologyAPIError(
        `Failed to delete property: ${message}`,
        'DELETE_PROPERTY_FAILED',
        { propertyName: name, originalError: message }
      )
    }
  }

  /**
   * Create a new class in the graph
   *
   * @param def - Class definition
   * @returns Created class entity
   * @throws OntologyAPIError if validation fails or creation fails
   *
   * @remarks
   * Attempts to create a class using the dedicated tag management APIs:
   * - `createTag()` to create the tag/class
   * - `addTagProperty()` to link properties to the tag
   * - `addTagExtends()` to set parent class inheritance
   *
   * Falls back to `createPage()` with `block/type: 'class'` if tag APIs are not available.
   * In Logseq DB mode, Tags and Classes are the same concept.
   */
  async createClass(def: ClassDefinition): Promise<ClassEntity> {
    validateClassDefinition(def)

    logger.debug('Creating class', { name: def.name })

    if (!isLogseqAvailable()) {
      throw new OntologyAPIError('Logseq API not available', 'LOGSEQ_NOT_AVAILABLE')
    }

    const api = getLogseqAPI()

    // Type for the Editor with tag methods (may not be available in all Logseq versions)
    type EditorWithTags = typeof api.Editor & {
      createTag?: (
        name: string,
        opts?: { uuid?: string }
      ) => Promise<{ id: number; uuid: string; name: string; originalName?: string } | null>
      addTagProperty?: (tagId: string | number, propertyIdOrName: string | number) => Promise<void>
      addTagExtends?: (tagId: string | number, parentTagIdOrName: string | number) => Promise<void>
      getTag?: (nameOrIdent: string | number) => Promise<{ id: number; uuid: string } | null>
      upsertBlockProperty?: (blockId: string, key: string, value: unknown) => Promise<void>
    }

    const editor = api.Editor as EditorWithTags

    // Check if tag APIs are available
    const hasTagAPIs = typeof editor.createTag === 'function'

    try {
      // Check if class already exists
      const existingPage = await api.Editor.getPage(def.name)
      if (existingPage) {
        throw new OntologyAPIError(`Class already exists: ${def.name}`, 'DUPLICATE_CLASS', {
          name: def.name,
        })
      }

      let entity: ClassEntity

      if (hasTagAPIs) {
        // Use dedicated tag APIs (preferred for DB mode)
        entity = await this.createClassWithTagAPI(def, editor)
      } else {
        // Fallback to createPage with block/type: 'class'
        logger.debug('Tag APIs not available, using createPage fallback')
        entity = await this.createClassWithPageAPI(def, api)
      }

      logger.info('Class created', {
        name: def.name,
        uuid: entity.uuid,
        method: hasTagAPIs ? 'tag-api' : 'page-api',
      })
      return entity
    } catch (error) {
      if (error instanceof OntologyAPIError) throw error

      // Handle non-Error objects (Logseq sometimes returns plain objects or strings)
      let message: string
      if (error instanceof Error) {
        message = error.message
      } else if (typeof error === 'string') {
        message = error
      } else if (error && typeof error === 'object') {
        message = JSON.stringify(error)
      } else {
        message = 'Unknown error'
      }

      // Check for DataCloneError (tag APIs might return non-serializable data)
      if (message.includes('DataCloneError') || message.includes('could not be cloned')) {
        logger.warn('Tag API returned non-serializable data, falling back to page API')
        try {
          const entity = await this.createClassWithPageAPI(def, api)
          logger.info('Class created via page API fallback', { name: def.name, uuid: entity.uuid })
          return entity
        } catch (fallbackError) {
          if (fallbackError instanceof OntologyAPIError) throw fallbackError
          const fallbackMessage =
            fallbackError instanceof Error ? fallbackError.message : 'Fallback failed'
          throw new OntologyAPIError(
            `Failed to create class: ${fallbackMessage}`,
            'CREATE_CLASS_FAILED',
            {
              className: def.name,
              originalError: fallbackMessage,
            }
          )
        }
      }

      // Check for plugin ownership restriction (Logseq DB-mode security)
      if (isPluginOwnershipError(error)) {
        logger.debug(
          `Class "${def.name}" could not be fully created due to ownership restrictions`,
          { name: def.name }
        )
        throw new OntologyAPIError(
          `Class creation restricted by plugin ownership: ${def.name}`,
          'PLUGIN_OWNERSHIP_RESTRICTED',
          { className: def.name }
        )
      }

      logger.error('createClass failed with raw error:', error)
      throw new OntologyAPIError(`Failed to create class: ${message}`, 'CREATE_CLASS_FAILED', {
        className: def.name,
        originalError: message,
      })
    }
  }

  /**
   * Create a class using the dedicated tag APIs
   *
   * @remarks
   * After creating the tag with `createTag()`, additional metadata fields
   * (description, title) are set via `upsertBlockProperty()` and icons are
   * set via `setBlockIcon()` since the tag API doesn't directly support these.
   */
  private async createClassWithTagAPI(
    def: ClassDefinition,
    editor: {
      createTag?: (
        name: string,
        opts?: { uuid?: string }
      ) => Promise<{ id: number; uuid: string; name: string; originalName?: string } | null>
      addTagProperty?: (tagId: string | number, propertyIdOrName: string | number) => Promise<void>
      addTagExtends?: (tagId: string | number, parentTagIdOrName: string | number) => Promise<void>
      upsertBlockProperty?: (blockId: string, key: string, value: unknown) => Promise<void>
    }
  ): Promise<ClassEntity> {
    if (!editor.createTag) {
      throw new OntologyAPIError('createTag API not available', 'API_NOT_AVAILABLE')
    }

    logger.debug('Creating tag', { name: def.name })
    const tag = await editor.createTag(def.name)

    if (!tag) {
      throw new OntologyAPIError(
        `Logseq failed to create tag for class: ${def.name}`,
        'CREATE_TAG_FAILED',
        { name: def.name }
      )
    }

    // Use tag UUID as the identifier for subsequent operations
    const tagId = tag.uuid

    // Set additional metadata fields via upsertBlockProperty
    // These fields are not directly supported by createTag
    if (editor.upsertBlockProperty) {
      const metadataFields: Array<[string, unknown, string]> = []

      // Use the full namespaced key for system description field
      // Discovery (Feb 2025): ':logseq.property/description' sets the SYSTEM description,
      // while 'description' would create a user property with that name
      if (def.description)
        metadataFields.push([tagId, def.description, ':logseq.property/description'])
      // NOTE: :logseq.class/title CANNOT be set - fails with "Plugins can only upsert its own properties"
      // This is a Logseq API limitation. Unlike :logseq.property/description which works,
      // the title field is restricted. (Tested Feb 2025)
      if (def.schemaVersion) metadataFields.push([tagId, def.schemaVersion, 'schema-version'])

      for (const [blockId, value, key] of metadataFields) {
        try {
          // Use safeApiCall to handle DataCloneError from postMessage serialization
          await safeApiCall(
            editor.upsertBlockProperty(blockId, key, value),
            `upsertBlockProperty(${key}) for tag "${def.name}"`
          )
          logger.debug(`Set ${key} for tag`, { tag: def.name, [key]: value })
        } catch (metaError) {
          // Log but don't fail - metadata is optional
          logger.debug(`Could not set ${key} for tag "${def.name}"`, {
            error: metaError instanceof Error ? metaError.message : String(metaError),
          })
        }
      }
    }

    // Add properties to the tag using addTagProperty
    if (def.properties && def.properties.length > 0 && editor.addTagProperty) {
      logger.debug('Adding properties to tag', {
        tagName: def.name,
        propertyCount: def.properties.length,
      })
      for (const propName of def.properties) {
        try {
          // Normalize property name to match Logseq's internal format
          const normalizedProp = propName.toLowerCase().replace(/\s+/g, '-')
          // Use safeApiCall to handle DataCloneError from postMessage serialization
          await safeApiCall(
            editor.addTagProperty(tagId, normalizedProp),
            `addTagProperty("${normalizedProp}") for tag "${def.name}"`
          )
          logger.debug('Added property to tag', { tag: def.name, property: normalizedProp })
        } catch (propError) {
          // Log but don't fail - property might not exist or be owned by another plugin
          logger.debug(`Could not add property "${propName}" to tag "${def.name}"`, {
            error: propError instanceof Error ? propError.message : String(propError),
          })
        }
      }
    }

    // Set parent class inheritance using addTagExtends
    if (def.parent && editor.addTagExtends) {
      logger.debug('Setting tag parent', { tag: def.name, parent: def.parent })
      try {
        // Use safeApiCall to handle DataCloneError from postMessage serialization
        await safeApiCall(
          editor.addTagExtends(tagId, def.parent),
          `addTagExtends("${def.parent}") for tag "${def.name}"`
        )
        logger.debug('Parent set for tag', { tag: def.name, parent: def.parent })
      } catch (parentError) {
        // Log but don't fail - parent tag might not exist
        logger.debug(`Could not set parent "${def.parent}" for tag "${def.name}"`, {
          error: parentError instanceof Error ? parentError.message : String(parentError),
        })
      }
    }

    // Set Tabler icon if provided (emoji icons not supported via API)
    if (def.icon) {
      await setTablerIcon(tagId, def.icon, def.iconType, `class/tag "${def.name}"`)
    }

    return {
      id: tag.id,
      uuid: tag.uuid,
      name: def.name,
      originalName: tag.originalName || def.title || def.name,
      parent: def.parent,
      properties: def.properties || [],
      children: [],
      schemaVersion: def.schemaVersion || 1,
    }
  }

  /**
   * Create a class using createPage with block/type: 'class' (fallback method)
   */
  private async createClassWithPageAPI(
    def: ClassDefinition,
    api: ReturnType<typeof getLogseqAPI>
  ): Promise<ClassEntity> {
    // Build page properties for the class
    const pageProperties: Record<string, unknown> = {
      'block/type': 'class',
    }

    if (def.description) pageProperties['description'] = def.description
    if (def.title) pageProperties['title'] = def.title
    if (def.parent) pageProperties['class/parent'] = def.parent
    // Don't set icon as property - use setBlockIcon API instead
    if (def.schemaVersion) pageProperties['schema-version'] = def.schemaVersion
    if (def.properties && def.properties.length > 0) {
      // Normalize property names to lowercase to match Logseq's internal format
      const normalizedProps = def.properties.map((p) => p.toLowerCase().replace(/\s+/g, '-'))
      pageProperties['class/properties'] = normalizedProps
    }

    // Create the class page
    logger.debug('Creating class page', { name: def.name, properties: Object.keys(pageProperties) })
    const page = await api.Editor.createPage(def.name, pageProperties, {
      redirect: false,
    })

    if (!page) {
      throw new OntologyAPIError(
        `Logseq failed to create page for class: ${def.name}`,
        'CREATE_PAGE_FAILED',
        { name: def.name }
      )
    }

    return {
      id: page.id,
      uuid: page.uuid,
      name: def.name,
      originalName: page.originalName || def.title || def.name,
      parent: def.parent,
      properties: def.properties || [],
      children: [],
      schemaVersion: def.schemaVersion || 1,
    }
  }

  /**
   * Update an existing class
   *
   * @param name - Class name (used as identifier)
   * @param updates - Partial class definition with fields to update
   * @throws OntologyAPIError if class not found or update fails
   *
   * @remarks
   * Classes in Logseq can be stored either on the page itself or on the first block.
   * This method attempts to update the first block if it exists, otherwise it will
   * throw an error since page-level property updates require different handling.
   */
  async updateClass(name: string, updates: Partial<ClassDefinition>): Promise<void> {
    validateName(name, 'class')

    // Early return if there's nothing to update
    const updateKeys = Object.keys(updates).filter(
      (k) => updates[k as keyof ClassDefinition] !== undefined
    )
    if (updateKeys.length === 0) {
      logger.debug('No updates provided for class', { name })
      return
    }

    logger.debug('Updating class', { name, updates: updateKeys })

    if (!isLogseqAvailable()) {
      throw new OntologyAPIError('Logseq API not available', 'LOGSEQ_NOT_AVAILABLE')
    }

    const api = getLogseqAPI()

    try {
      // Verify class exists
      const page = await api.Editor.getPage(name)
      if (!page) {
        throw new OntologyAPIError(`Class not found: ${name}`, 'CLASS_NOT_FOUND', { name })
      }

      // Get page blocks
      const blocks = await api.Editor.getPageBlocksTree(name)

      // Find a valid block to update
      const targetBlock = this.findValidBlock(blocks)

      if (!targetBlock) {
        // No valid blocks found - this is a structural issue
        throw new OntologyAPIError(
          `Class page "${name}" has no valid blocks to update. ` +
            `The page may be empty or have an invalid structure.`,
          'NO_VALID_BLOCKS',
          { name, blocksFound: blocks?.length ?? 0 }
        )
      }

      // Update properties on the target block
      const updatePromises: Promise<void>[] = []

      if (updates.description !== undefined) {
        // Use the full namespaced key for system description field
        updatePromises.push(
          api.Editor.upsertBlockProperty(
            targetBlock.uuid,
            ':logseq.property/description',
            updates.description
          )
        )
      }
      if (updates.parent !== undefined) {
        updatePromises.push(
          api.Editor.upsertBlockProperty(targetBlock.uuid, 'class/parent', updates.parent)
        )
      }
      if (updates.properties !== undefined) {
        // Normalize property names to lowercase to match Logseq's internal format
        const normalizedProps = updates.properties.map((p) => p.toLowerCase().replace(/\s+/g, '-'))
        updatePromises.push(
          api.Editor.upsertBlockProperty(targetBlock.uuid, 'class/properties', normalizedProps)
        )
      }
      // NOTE: updates.title is intentionally NOT applied here.
      // :logseq.class/title CANNOT be set - fails with "Plugins can only upsert its own properties"
      // This is a confirmed Logseq API limitation. (Tested Feb 2025)

      if (updatePromises.length === 0) {
        logger.debug('No applicable updates for class', { name })
        return
      }

      await Promise.all(updatePromises)

      // Set Tabler icon if provided (emoji icons not supported via API)
      // NOTE: Tabler icons work via setBlockIcon, emoji icons fail due to
      // inaccessible emoji lookup table. (Discovery: Feb 2025)
      if (updates.icon !== undefined) {
        await setTablerIcon(targetBlock.uuid, updates.icon, updates.iconType, `class "${name}"`)
      }

      logger.info('Class updated', { name, updatedFields: updateKeys })
    } catch (error) {
      if (error instanceof OntologyAPIError) throw error
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OntologyAPIError(`Failed to update class: ${message}`, 'UPDATE_CLASS_FAILED', {
        className: name,
        originalError: message,
      })
    }
  }

  /**
   * Delete a class
   *
   * @param name - Class name to delete
   * @throws OntologyAPIError if deletion fails
   */
  async deleteClass(name: string): Promise<void> {
    validateName(name, 'class')

    logger.debug('Deleting class', { name })

    if (!isLogseqAvailable()) {
      throw new OntologyAPIError('Logseq API not available', 'LOGSEQ_NOT_AVAILABLE')
    }

    const api = getLogseqAPI()

    try {
      await api.Editor.deletePage(name)
      logger.info('Class deleted', { name })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OntologyAPIError(`Failed to delete class: ${message}`, 'DELETE_CLASS_FAILED', {
        className: name,
        originalError: message,
      })
    }
  }

  /**
   * Get all existing properties from the graph
   *
   * @returns Map of property name to property entity
   * @throws OntologyAPIError if query fails
   */
  async getExistingProperties(): Promise<Map<string, PropertyEntity>> {
    logger.debug('Fetching existing properties')

    try {
      const results = await executeQuery<Record<string, unknown>>(QUERY_ALL_PROPERTIES)
      const properties = new Map<string, PropertyEntity>()

      for (const result of results) {
        if (result && result['block/uuid']) {
          const entity: PropertyEntity = {
            id: (result['db/id'] as number) || 0,
            uuid: result['block/uuid'] as string,
            name: (result['block/name'] as string) || '',
            originalName: (result['block/original-name'] as string) || '',
            type: (result['property/schema-type'] as PropertyValueType) || 'default',
            cardinality: (result['property/cardinality'] as PropertyCardinality) || 'one',
            hide: (result['property/hide?'] as boolean) || false,
            schemaVersion: (result['schema-version'] as number) || 1,
            classes: (result['property/classes'] as string[]) || [],
          }
          properties.set(entity.name, entity)
        }
      }

      logger.info('Fetched properties', { count: properties.size })
      return properties
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OntologyAPIError(
        `Failed to fetch properties: ${message}`,
        'FETCH_PROPERTIES_FAILED',
        { originalError: message }
      )
    }
  }

  /**
   * Get all existing classes from the graph
   *
   * @returns Map of class name to class entity
   * @throws OntologyAPIError if query fails
   */
  async getExistingClasses(): Promise<Map<string, ClassEntity>> {
    logger.debug('Fetching existing classes')

    try {
      const results = await executeQuery<Record<string, unknown>>(QUERY_ALL_CLASSES)
      const classes = new Map<string, ClassEntity>()

      for (const result of results) {
        if (result && result['block/uuid']) {
          const entity: ClassEntity = {
            id: (result['db/id'] as number) || 0,
            uuid: result['block/uuid'] as string,
            name: (result['block/name'] as string) || '',
            originalName: (result['block/original-name'] as string) || '',
            parent: result['class/parent'] as string | undefined,
            properties: (result['class/properties'] as string[]) || [],
            children: (result['class/children'] as string[]) || [],
            schemaVersion: (result['schema-version'] as number) || 1,
          }
          classes.set(entity.name, entity)
        }
      }

      logger.info('Fetched classes', { count: classes.size })
      return classes
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new OntologyAPIError(`Failed to fetch classes: ${message}`, 'FETCH_CLASSES_FAILED', {
        originalError: message,
      })
    }
  }

  // ==========================================================================
  // Batch Operations
  // ==========================================================================

  /**
   * Begin a new batch of operations
   *
   * @remarks
   * **WARNING: Batch operations are NOT atomic!**
   * If an operation fails mid-batch, previous operations will NOT be rolled back.
   * The `appliedItems` in the result can be used for manual cleanup if needed.
   *
   * @returns Batch ID for tracking
   * @throws OntologyAPIError if a batch is already in progress
   */
  beginBatch(): string {
    if (this.pendingBatch) {
      throw new OntologyAPIError(
        'A batch is already in progress. Call executeBatch() or cancelBatch() first.',
        'BATCH_IN_PROGRESS',
        { existingBatchId: this.pendingBatch.id }
      )
    }

    this.pendingBatch = {
      id: crypto.randomUUID(),
      operations: [],
      status: 'pending',
      startedAt: new Date().toISOString(),
      appliedItems: [],
    }

    logger.debug('Batch started', { id: this.pendingBatch.id })
    return this.pendingBatch.id
  }

  /**
   * Add an operation to the current batch
   *
   * @param operation - Operation to add
   * @throws OntologyAPIError if no batch is in progress or operation is invalid
   */
  addToBatch(operation: BatchOperation): void {
    if (!this.pendingBatch) {
      throw new OntologyAPIError('No batch in progress. Call beginBatch() first.', 'NO_BATCH')
    }

    // Validate operation
    if (!operation.name) {
      throw new OntologyAPIError('Operation must have a name', 'INVALID_OPERATION', { operation })
    }

    if (operation.type.startsWith('create') && !operation.data) {
      throw new OntologyAPIError(`Create operation requires data`, 'INVALID_OPERATION', {
        operation,
      })
    }

    this.pendingBatch.operations.push(operation)
    logger.debug('Added to batch', {
      batchId: this.pendingBatch.id,
      operation: operation.type,
      name: operation.name,
    })
  }

  /**
   * Execute all operations in the current batch
   *
   * @remarks
   * **WARNING: NOT atomic!** Failed operations will not roll back previous ones.
   *
   * @param onProgress - Optional progress callback
   * @returns Result with success/failure counts and applied items
   */
  async executeBatch(onProgress?: ProgressCallback): Promise<BatchResult> {
    if (!this.pendingBatch) {
      throw new OntologyAPIError('No batch in progress. Call beginBatch() first.', 'NO_BATCH')
    }

    const batch = this.pendingBatch
    batch.status = 'executing'

    const result: BatchResult = {
      total: batch.operations.length,
      succeeded: 0,
      failed: 0,
      errors: [],
      appliedItems: [],
    }

    logger.info('Executing batch', {
      id: batch.id,
      operationCount: batch.operations.length,
    })

    for (let i = 0; i < batch.operations.length; i++) {
      const op = batch.operations[i]!

      try {
        await this.executeOperation(op)
        result.succeeded++
        result.appliedItems.push(op.name)
        batch.appliedItems.push(op.name)
      } catch (error) {
        result.failed++
        result.errors.push({
          index: i,
          item: op.name,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        logger.error('Batch operation failed', error, {
          batchId: batch.id,
          operation: op.type,
          name: op.name,
          index: i,
        })
      }

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: batch.operations.length,
          percentage: Math.round(((i + 1) / batch.operations.length) * 100),
        })
      }
    }

    batch.status = result.failed > 0 ? 'failed' : 'completed'
    batch.completedAt = new Date().toISOString()

    logger.info('Batch completed', {
      id: batch.id,
      succeeded: result.succeeded,
      failed: result.failed,
    })

    // Clear the pending batch
    this.pendingBatch = null

    return result
  }

  /**
   * Cancel the current batch without executing
   *
   * @throws OntologyAPIError if no batch is in progress
   */
  cancelBatch(): void {
    if (!this.pendingBatch) {
      throw new OntologyAPIError('No batch in progress', 'NO_BATCH')
    }

    logger.info(`Batch cancelled: ${this.pendingBatch.id}`)
    this.pendingBatch = null
  }

  /**
   * Get the current batch status
   *
   * @returns Current batch info or null if no batch in progress
   */
  getBatchStatus(): { id: string; operationCount: number; status: string } | null {
    if (!this.pendingBatch) return null

    return {
      id: this.pendingBatch.id,
      operationCount: this.pendingBatch.operations.length,
      status: this.pendingBatch.status,
    }
  }

  // ==========================================================================
  // Generic Batch Executor
  // ==========================================================================

  /**
   * Execute an operation on a batch of items
   *
   * This is a generic utility for running the same operation on multiple items
   * with progress tracking and error handling. Unlike the batch API (beginBatch,
   * addToBatch, executeBatch), this does not require setting up a batch first.
   *
   * @param items - Array of items to process
   * @param operation - Async function to run on each item
   * @param onProgress - Optional progress callback
   * @returns Result with success/failure counts
   *
   * @example
   * ```typescript
   * const result = await api.runBatch(
   *   propertyDefs,
   *   async (def) => api.createProperty(def),
   *   (progress) => console.log(`${progress.percentage}% complete`)
   * )
   * ```
   */
  async runBatch<T>(
    items: T[],
    operation: (item: T) => Promise<void>,
    onProgress?: ProgressCallback
  ): Promise<BatchResult> {
    const result: BatchResult = {
      total: items.length,
      succeeded: 0,
      failed: 0,
      errors: [],
      appliedItems: [],
    }

    for (let i = 0; i < items.length; i++) {
      try {
        await operation(items[i]!)
        result.succeeded++
        result.appliedItems.push(String(i))
      } catch (error) {
        result.failed++
        result.errors.push({
          index: i,
          item: String(i),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      if (onProgress) {
        onProgress({
          current: i + 1,
          total: items.length,
          percentage: Math.round(((i + 1) / items.length) * 100),
        })
      }
    }

    return result
  }

  // ==========================================================================
  // Legacy Transaction API (Deprecated)
  // ==========================================================================

  /**
   * @deprecated Use beginBatch() instead. This method exists for backwards compatibility.
   */
  beginTransaction(): Promise<{
    id: string
    operations: unknown[]
    status: string
    startedAt: string
  }> {
    logger.warn('beginTransaction() is deprecated, use beginBatch() instead')
    try {
      const id = this.beginBatch()
      return Promise.resolve({
        id,
        operations: [],
        status: 'pending',
        startedAt: new Date().toISOString(),
      })
    } catch (error) {
      return Promise.reject(error)
    }
  }

  /**
   * @deprecated Use addToBatch() instead. This method exists for backwards compatibility.
   */
  addToTransaction(operation: { type: string; id?: string; data?: Record<string, unknown> }): void {
    logger.warn('addToTransaction() is deprecated, use addToBatch() instead')

    if (!operation.data) {
      logger.warn('addToTransaction() called without data, skipping')
      return
    }

    const name =
      operation.id || (typeof operation.data.name === 'string' ? operation.data.name : '')

    // Validate operation type before casting
    const validTypes: BatchOperation['type'][] = [
      'createProperty',
      'updateProperty',
      'deleteProperty',
      'createClass',
      'updateClass',
      'deleteClass',
    ]

    if (!validTypes.includes(operation.type as BatchOperation['type'])) {
      logger.warn('addToTransaction() called with invalid operation type', {
        type: operation.type,
      })
      return
    }

    // Convert legacy data format to new format with proper type checking
    const batchData = this.convertLegacyData(operation.type, operation.data)

    this.addToBatch({
      type: operation.type as BatchOperation['type'],
      name,
      data: batchData,
    })
  }

  /**
   * Convert legacy transaction data to properly typed batch data
   */
  private convertLegacyData(
    type: string,
    data: Record<string, unknown>
  ): PropertyDefinition | ClassDefinition | Partial<PropertyDefinition> | Partial<ClassDefinition> {
    if (type.includes('Property')) {
      // Property operation - extract relevant fields
      return {
        name: typeof data.name === 'string' ? data.name : '',
        type: typeof data.type === 'string' ? (data.type as PropertyDefinition['type']) : 'default',
        cardinality:
          typeof data.cardinality === 'string'
            ? (data.cardinality as PropertyDefinition['cardinality'])
            : 'one',
        description: typeof data.description === 'string' ? data.description : undefined,
        title: typeof data.title === 'string' ? data.title : undefined,
        hide: typeof data.hide === 'boolean' ? data.hide : undefined,
      } satisfies Partial<PropertyDefinition>
    } else {
      // Class operation - extract relevant fields
      return {
        name: typeof data.name === 'string' ? data.name : '',
        parent: typeof data.parent === 'string' ? data.parent : undefined,
        description: typeof data.description === 'string' ? data.description : undefined,
        title: typeof data.title === 'string' ? data.title : undefined,
        properties: Array.isArray(data.properties)
          ? data.properties.filter((p): p is string => typeof p === 'string')
          : undefined,
        icon: typeof data.icon === 'string' ? data.icon : undefined,
      } satisfies Partial<ClassDefinition>
    }
  }

  /**
   * @deprecated Use executeBatch() instead. This method exists for backwards compatibility.
   */
  async commitTransaction(): Promise<void> {
    logger.warn('commitTransaction() is deprecated, use executeBatch() instead')
    await this.executeBatch()
  }

  /**
   * @deprecated Use cancelBatch() instead. This method exists for backwards compatibility.
   */
  rollbackTransaction(): Promise<void> {
    logger.warn(
      'rollbackTransaction() is deprecated and does NOT actually rollback changes. Use cancelBatch() instead.'
    )
    this.cancelBatch()
    return Promise.resolve()
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Find a valid block with a uuid in the blocks array
   *
   * @param blocks - Array of blocks from getPageBlocksTree
   * @returns The first valid block with a uuid, or null if none found
   *
   * @remarks
   * Logseq pages may have multiple blocks, and not all blocks may have valid uuids.
   * This method searches for the first block that has a valid uuid property,
   * which is required for updating block properties.
   */
  private findValidBlock(blocks: unknown[] | null): LogseqBlock | null {
    if (!blocks || !Array.isArray(blocks) || blocks.length === 0) {
      return null
    }

    // Check each block for a valid uuid
    for (const block of blocks) {
      if (this.isValidBlock(block)) {
        return block
      }
    }

    return null
  }

  /**
   * Type guard to check if a value is a valid LogseqBlock with uuid
   */
  private isValidBlock(value: unknown): value is LogseqBlock {
    if (!value || typeof value !== 'object') {
      return false
    }
    const block = value as Record<string, unknown>
    return typeof block.uuid === 'string' && block.uuid.length > 0
  }

  /**
   * Execute a single batch operation
   */
  private async executeOperation(op: BatchOperation): Promise<void> {
    switch (op.type) {
      case 'createProperty':
        if (!isPropertyDefinition(op.data)) {
          throw new OntologyAPIError('Invalid property definition', 'INVALID_DATA', {
            operation: op,
          })
        }
        await this.createProperty(op.data)
        break

      case 'updateProperty':
        if (!isPartialPropertyDefinition(op.data)) {
          throw new OntologyAPIError('Invalid property update data', 'INVALID_DATA', {
            operation: op,
          })
        }
        await this.updateProperty(op.name, op.data)
        break

      case 'deleteProperty':
        await this.deleteProperty(op.name)
        break

      case 'createClass':
        if (!isClassDefinition(op.data)) {
          throw new OntologyAPIError('Invalid class definition', 'INVALID_DATA', { operation: op })
        }
        await this.createClass(op.data)
        break

      case 'updateClass':
        if (!isPartialClassDefinition(op.data)) {
          throw new OntologyAPIError('Invalid class update data', 'INVALID_DATA', { operation: op })
        }
        await this.updateClass(op.name, op.data)
        break

      case 'deleteClass':
        await this.deleteClass(op.name)
        break

      default: {
        // This case should never be reached due to type checking,
        // but we handle it for runtime safety
        const unknownOp = op as { type: string }
        throw new OntologyAPIError(
          `Unknown operation type: ${unknownOp.type}`,
          'UNKNOWN_OPERATION',
          {
            operation: op,
          }
        )
      }
    }
  }
}
