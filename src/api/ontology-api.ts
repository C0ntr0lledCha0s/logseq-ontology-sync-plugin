/**
 * Logseq Ontology API
 * High-level API for managing ontology classes and properties
 */

import { logger } from '../utils/logger'
import type {
  PropertyDefinition,
  PropertyEntity,
  ClassDefinition,
  ClassEntity,
  Transaction,
  TransactionOperation,
  APIError,
  ProgressCallback,
  BatchResult,
} from './types'

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
      // In real implementation, this would call logseq.Editor.createPage
      // with property-specific configuration
      const entity: PropertyEntity = {
        id: Date.now(),
        uuid: crypto.randomUUID(),
        name: def.name,
        originalName: def.title || def.name,
        type: def.type,
        cardinality: def.cardinality,
        hide: def.hide,
        schemaVersion: def.schemaVersion || 1,
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
      // In real implementation, this would call logseq.Editor.upsertBlockProperty
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
      // In real implementation, this would call logseq.Editor.deletePage
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
      const entity: ClassEntity = {
        id: Date.now(),
        uuid: crypto.randomUUID(),
        name: def.name,
        originalName: def.title || def.name,
        parent: def.parent,
        properties: def.properties || [],
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
      // In real implementation, this would use datascript query
      const properties = new Map<string, PropertyEntity>()
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
      const classes = new Map<string, ClassEntity>()
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
  ): Promise<BatchResult> {
    const results: BatchResult = {
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
        await this.createProperty(op.data as PropertyDefinition)
        break
      case 'updateProperty':
        await this.updateProperty(op.id!, op.data as Partial<PropertyDefinition>)
        break
      case 'deleteProperty':
        await this.deleteProperty(op.id!)
        break
      case 'createClass':
        await this.createClass(op.data as ClassDefinition)
        break
      case 'updateClass':
        await this.updateClass(op.id!, op.data as Partial<ClassDefinition>)
        break
      case 'deleteClass':
        await this.deleteClass(op.id!)
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
