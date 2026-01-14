/**
 * Logseq Ontology API
 * High-level API for managing ontology classes and properties
 */

import { logger } from '../utils/logger'
import { executeQuery, QUERY_ALL_PROPERTIES, QUERY_ALL_CLASSES } from './queries'
import type {
  PropertyDefinition,
  PropertyEntity,
  PropertyValueType,
  PropertyCardinality,
  ClassDefinition,
  ClassEntity,
  Transaction,
  TransactionOperation,
} from './types'

/**
 * Progress callback for batch operations
 */
type ProgressCallback = (progress: { current: number; total: number; percentage: number }) => void

/**
 * Simple batch result for internal use
 */
interface SimpleBatchResult {
  total: number
  succeeded: number
  failed: number
  errors: Array<{ index: number; error: string }>
}

/**
 * API error type for internal use
 */
interface APIError extends Error {
  code: string
  details?: Record<string, unknown>
}

/**
 * Logseq Ontology API class
 * Provides CRUD operations for ontology management
 */
export class LogseqOntologyAPI {
  private pendingTransaction: Transaction | null = null

  /**
   * Create a new property in the graph
   */
  async createProperty(def: PropertyDefinition): Promise<PropertyEntity> {
    logger.debug('Creating property', { name: def.name })

    try {
      // Normalize property name to kebab-case for Logseq
      const normalizedName = def.name.toLowerCase().replace(/\s+/g, '-')

      // Build page properties for the property page
      const pageProperties: Record<string, unknown> = {
        'block/type': 'property',
        'property/schema-type': def.type,
        'property/cardinality': def.cardinality,
      }

      if (def.description) pageProperties['description'] = def.description
      if (def.title) pageProperties['title'] = def.title
      if (def.hide !== undefined) pageProperties['property/hide?'] = def.hide
      if (def.schemaVersion) pageProperties['schema-version'] = def.schemaVersion
      if (def.classes && def.classes.length > 0) {
        pageProperties['property/classes'] = def.classes
      }

      // Create the property page in Logseq
      const page = await logseq.Editor.createPage(normalizedName, pageProperties, {
        redirect: false,
      })

      if (!page) {
        throw new Error(`Failed to create property page: ${normalizedName}`)
      }

      const entity: PropertyEntity = {
        id: page.id as number,
        uuid: page.uuid,
        name: normalizedName,
        originalName: page.originalName || def.title || def.name,
        type: def.type,
        cardinality: def.cardinality,
        hide: def.hide ?? false,
        schemaVersion: def.schemaVersion || 1,
        classes: def.classes || [],
      }

      logger.info('Property created', { name: def.name, uuid: entity.uuid })
      return entity
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw this.createError('CREATE_PROPERTY_FAILED', `Failed to create property: ${message}`, {
        propertyName: def.name,
      })
    }
  }

  /**
   * Update an existing property
   */
  async updateProperty(id: string, def: Partial<PropertyDefinition>): Promise<void> {
    logger.debug('Updating property', { id, updates: Object.keys(def) })

    try {
      // Get the existing page by name (id is the property name)
      const page = await logseq.Editor.getPage(id)
      if (!page) {
        throw new Error(`Property not found: ${id}`)
      }

      // Update individual properties using upsertBlockProperty
      const block = await logseq.Editor.getPageBlocksTree(id)
      const firstBlock = block?.[0]

      if (firstBlock) {
        if (def.type !== undefined) {
          await logseq.Editor.upsertBlockProperty(firstBlock.uuid, 'property/schema-type', def.type)
        }
        if (def.cardinality !== undefined) {
          await logseq.Editor.upsertBlockProperty(firstBlock.uuid, 'property/cardinality', def.cardinality)
        }
        if (def.description !== undefined) {
          await logseq.Editor.upsertBlockProperty(firstBlock.uuid, 'description', def.description)
        }
        if (def.hide !== undefined) {
          await logseq.Editor.upsertBlockProperty(firstBlock.uuid, 'property/hide?', def.hide)
        }
      }

      logger.info('Property updated', { id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw this.createError('UPDATE_PROPERTY_FAILED', `Failed to update property: ${message}`, {
        propertyId: id,
      })
    }
  }

  /**
   * Delete a property
   */
  async deleteProperty(id: string): Promise<void> {
    logger.debug('Deleting property', { id })

    try {
      // Delete the property page
      await logseq.Editor.deletePage(id)
      logger.info('Property deleted', { id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw this.createError('DELETE_PROPERTY_FAILED', `Failed to delete property: ${message}`, {
        propertyId: id,
      })
    }
  }

  /**
   * Create a new class in the graph
   */
  async createClass(def: ClassDefinition): Promise<ClassEntity> {
    logger.debug('Creating class', { name: def.name })

    try {
      // Build page properties for the class page
      const pageProperties: Record<string, unknown> = {
        'block/type': 'class',
      }

      if (def.description) pageProperties['description'] = def.description
      if (def.title) pageProperties['title'] = def.title
      if (def.parent) pageProperties['class/parent'] = def.parent
      if (def.icon) pageProperties['icon'] = def.icon
      if (def.schemaVersion) pageProperties['schema-version'] = def.schemaVersion
      if (def.properties && def.properties.length > 0) {
        pageProperties['class/properties'] = def.properties
      }

      // Create the class page in Logseq
      const page = await logseq.Editor.createPage(def.name, pageProperties, {
        redirect: false,
      })

      if (!page) {
        throw new Error(`Failed to create class page: ${def.name}`)
      }

      const entity: ClassEntity = {
        id: page.id as number,
        uuid: page.uuid,
        name: def.name,
        originalName: page.originalName || def.title || def.name,
        parent: def.parent,
        properties: def.properties || [],
        children: [],
        schemaVersion: def.schemaVersion || 1,
      }

      logger.info('Class created', { name: def.name, uuid: entity.uuid })
      return entity
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw this.createError('CREATE_CLASS_FAILED', `Failed to create class: ${message}`, {
        className: def.name,
      })
    }
  }

  /**
   * Update an existing class
   */
  async updateClass(id: string, def: Partial<ClassDefinition>): Promise<void> {
    logger.debug('Updating class', { id, updates: Object.keys(def) })

    try {
      // Get the existing page by name (id is the class name)
      const page = await logseq.Editor.getPage(id)
      if (!page) {
        throw new Error(`Class not found: ${id}`)
      }

      // Update individual properties using upsertBlockProperty
      const block = await logseq.Editor.getPageBlocksTree(id)
      const firstBlock = block?.[0]

      if (firstBlock) {
        if (def.description !== undefined) {
          await logseq.Editor.upsertBlockProperty(firstBlock.uuid, 'description', def.description)
        }
        if (def.parent !== undefined) {
          await logseq.Editor.upsertBlockProperty(firstBlock.uuid, 'class/parent', def.parent)
        }
        if (def.properties !== undefined) {
          await logseq.Editor.upsertBlockProperty(firstBlock.uuid, 'class/properties', def.properties)
        }
        if (def.icon !== undefined) {
          await logseq.Editor.upsertBlockProperty(firstBlock.uuid, 'icon', def.icon)
        }
      }

      logger.info('Class updated', { id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw this.createError('UPDATE_CLASS_FAILED', `Failed to update class: ${message}`, {
        classId: id,
      })
    }
  }

  /**
   * Delete a class
   */
  async deleteClass(id: string): Promise<void> {
    logger.debug('Deleting class', { id })

    try {
      // Delete the class page
      await logseq.Editor.deletePage(id)
      logger.info('Class deleted', { id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw this.createError('DELETE_CLASS_FAILED', `Failed to delete class: ${message}`, {
        classId: id,
      })
    }
  }

  /**
   * Get all existing properties from the graph
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
      throw this.createError('FETCH_PROPERTIES_FAILED', `Failed to fetch properties: ${message}`)
    }
  }

  /**
   * Get all existing classes from the graph
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
      throw this.createError('FETCH_CLASSES_FAILED', `Failed to fetch classes: ${message}`)
    }
  }

  /**
   * Begin a new transaction for atomic operations
   */
  async beginTransaction(): Promise<Transaction> {
    if (this.pendingTransaction) {
      throw this.createError('TRANSACTION_EXISTS', 'A transaction is already in progress')
    }

    this.pendingTransaction = {
      id: crypto.randomUUID(),
      operations: [],
      status: 'pending',
      startedAt: new Date().toISOString(),
    }

    logger.debug('Transaction started', { id: this.pendingTransaction.id })
    return this.pendingTransaction
  }

  /**
   * Add operation to current transaction
   */
  addToTransaction(operation: TransactionOperation): void {
    if (!this.pendingTransaction) {
      throw this.createError('NO_TRANSACTION', 'No transaction in progress')
    }

    this.pendingTransaction.operations.push(operation)
  }

  /**
   * Commit the current transaction
   */
  async commitTransaction(): Promise<void> {
    if (!this.pendingTransaction) {
      throw this.createError('NO_TRANSACTION', 'No transaction to commit')
    }

    try {
      logger.debug('Committing transaction', {
        id: this.pendingTransaction.id,
        operations: this.pendingTransaction.operations.length,
      })

      // Execute all operations
      for (const op of this.pendingTransaction.operations) {
        await this.executeOperation(op)
      }

      this.pendingTransaction.status = 'committed'
      this.pendingTransaction.completedAt = new Date().toISOString()

      logger.info('Transaction committed', { id: this.pendingTransaction.id })
    } catch (error) {
      this.pendingTransaction.status = 'failed'
      throw error
    } finally {
      this.pendingTransaction = null
    }
  }

  /**
   * Rollback the current transaction
   */
  async rollbackTransaction(): Promise<void> {
    if (!this.pendingTransaction) {
      throw this.createError('NO_TRANSACTION', 'No transaction to rollback')
    }

    logger.info('Transaction rolled back', { id: this.pendingTransaction.id })
    this.pendingTransaction.status = 'rolledback'
    this.pendingTransaction = null
  }

  /**
   * Execute batch operations with progress tracking
   */
  async executeBatch<T>(
    items: T[],
    operation: (item: T) => Promise<void>,
    onProgress?: ProgressCallback
  ): Promise<SimpleBatchResult> {
    const results: SimpleBatchResult = {
      total: items.length,
      succeeded: 0,
      failed: 0,
      errors: [],
    }

    for (let i = 0; i < items.length; i++) {
      try {
        await operation(items[i]!)
        results.succeeded++
      } catch (error) {
        results.failed++
        results.errors.push({
          index: i,
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

    return results
  }

  /**
   * Execute a single transaction operation
   */
  private async executeOperation(op: TransactionOperation): Promise<void> {
    switch (op.type) {
      case 'createProperty':
        if (!op.data) throw this.createError('INVALID_OPERATION', 'Missing data for createProperty')
        await this.createProperty(op.data as unknown as PropertyDefinition)
        break
      case 'updateProperty':
        if (!op.id) throw this.createError('INVALID_OPERATION', 'Missing id for updateProperty')
        await this.updateProperty(op.id, (op.data ?? {}) as unknown as Partial<PropertyDefinition>)
        break
      case 'deleteProperty':
        if (!op.id) throw this.createError('INVALID_OPERATION', 'Missing id for deleteProperty')
        await this.deleteProperty(op.id)
        break
      case 'createClass':
        if (!op.data) throw this.createError('INVALID_OPERATION', 'Missing data for createClass')
        await this.createClass(op.data as unknown as ClassDefinition)
        break
      case 'updateClass':
        if (!op.id) throw this.createError('INVALID_OPERATION', 'Missing id for updateClass')
        await this.updateClass(op.id, (op.data ?? {}) as unknown as Partial<ClassDefinition>)
        break
      case 'deleteClass':
        if (!op.id) throw this.createError('INVALID_OPERATION', 'Missing id for deleteClass')
        await this.deleteClass(op.id)
        break
      default:
        throw this.createError('UNKNOWN_OPERATION', `Unknown operation type: ${op.type}`)
    }
  }

  /**
   * Create a typed API error
   */
  private createError(code: string, message: string, details?: Record<string, unknown>): APIError {
    const error = new Error(message) as APIError
    error.code = code
    error.details = details
    return error
  }
}
