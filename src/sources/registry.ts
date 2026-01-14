/**
 * Source Registry Module
 * Manages template sources - add, remove, update, and query operations
 */

import { logger } from '../utils/logger'
import type {
  TemplateSource,
  SourceInput,
  SourceUpdate,
  ValidationResult,
} from './types'
import { SourceNotFoundError } from './types'

/**
 * Generate a unique ID for sources
 */
function generateId(): string {
  return `src_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Validate a URL format
 */
function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validate a local file path format
 */
function isValidLocalPath(path: string): boolean {
  // Basic validation - path should not be empty and should have .edn extension
  if (!path || typeof path !== 'string') {
    return false
  }
  // Allow relative and absolute paths, must end with .edn
  return path.endsWith('.edn')
}

/**
 * Source Registry for managing template sources
 */
export class SourceRegistry {
  private sources: Map<string, TemplateSource>

  constructor(initialSources: TemplateSource[] = []) {
    this.sources = new Map()
    for (const source of initialSources) {
      this.sources.set(source.id, source)
    }
    logger.debug('SourceRegistry initialized', { count: this.sources.size })
  }

  /**
   * Add a new source to the registry
   */
  async addSource(input: SourceInput): Promise<TemplateSource> {
    const id = generateId()
    const source: TemplateSource = {
      ...input,
      id,
    }

    // Validate before adding
    const validation = await this.validateSource(source)
    if (!validation.valid) {
      throw new Error(`Invalid source: ${validation.errors.join(', ')}`)
    }

    this.sources.set(id, source)
    logger.info('Source added', { id, name: source.name, type: source.type })

    return source
  }

  /**
   * Remove a source from the registry
   */
  async removeSource(id: string): Promise<void> {
    if (!this.sources.has(id)) {
      throw new SourceNotFoundError(id)
    }

    this.sources.delete(id)
    logger.info('Source removed', { id })
  }

  /**
   * Update an existing source
   */
  async updateSource(id: string, updates: SourceUpdate): Promise<TemplateSource> {
    const existing = this.sources.get(id)
    if (!existing) {
      throw new SourceNotFoundError(id)
    }

    const updated: TemplateSource = {
      ...existing,
      ...updates,
    }

    // Validate the updated source
    const validation = await this.validateSource(updated)
    if (!validation.valid) {
      throw new Error(`Invalid source update: ${validation.errors.join(', ')}`)
    }

    this.sources.set(id, updated)
    logger.info('Source updated', { id, updates: Object.keys(updates) })

    return updated
  }

  /**
   * Get a source by ID
   */
  async getSource(id: string): Promise<TemplateSource | null> {
    return this.sources.get(id) ?? null
  }

  /**
   * Get all sources
   */
  async getAllSources(): Promise<TemplateSource[]> {
    return Array.from(this.sources.values())
  }

  /**
   * Get all enabled sources
   */
  async getEnabledSources(): Promise<TemplateSource[]> {
    return Array.from(this.sources.values()).filter((s) => s.enabled)
  }

  /**
   * Get sources by type
   */
  async getSourcesByType(type: 'local' | 'url'): Promise<TemplateSource[]> {
    return Array.from(this.sources.values()).filter((s) => s.type === type)
  }

  /**
   * Validate a source configuration
   */
  async validateSource(source: TemplateSource): Promise<ValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    // Validate required fields
    if (!source.id || typeof source.id !== 'string') {
      errors.push('Source ID is required and must be a string')
    }

    if (!source.name || typeof source.name !== 'string') {
      errors.push('Source name is required and must be a string')
    } else if (source.name.length > 100) {
      warnings.push('Source name is very long (>100 characters)')
    }

    if (!source.type || !['local', 'url'].includes(source.type)) {
      errors.push('Source type must be "local" or "url"')
    }

    if (!source.location || typeof source.location !== 'string') {
      errors.push('Source location is required and must be a string')
    } else {
      // Validate location based on type
      if (source.type === 'url' && !isValidUrl(source.location)) {
        errors.push('Invalid URL format. Must be HTTP or HTTPS')
      }
      if (source.type === 'local' && !isValidLocalPath(source.location)) {
        errors.push('Invalid local path. Must end with .edn extension')
      }
    }

    if (typeof source.enabled !== 'boolean') {
      errors.push('Source enabled must be a boolean')
    }

    // Optional field validations
    if (source.description && typeof source.description !== 'string') {
      errors.push('Source description must be a string')
    }

    if (source.version && typeof source.version !== 'string') {
      errors.push('Source version must be a string')
    }

    if (source.lastFetched && typeof source.lastFetched !== 'string') {
      errors.push('Source lastFetched must be an ISO date string')
    }

    if (source.checksum && typeof source.checksum !== 'string') {
      errors.push('Source checksum must be a string')
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  /**
   * Check if a source with the given name already exists
   */
  async hasSourceWithName(name: string): Promise<boolean> {
    return Array.from(this.sources.values()).some(
      (s) => s.name.toLowerCase() === name.toLowerCase()
    )
  }

  /**
   * Get the count of sources
   */
  async getSourceCount(): Promise<number> {
    return this.sources.size
  }

  /**
   * Clear all sources
   */
  async clearAll(): Promise<void> {
    this.sources.clear()
    logger.info('All sources cleared')
  }

  /**
   * Export sources as JSON
   */
  async exportSources(): Promise<string> {
    const sources = await this.getAllSources()
    return JSON.stringify(sources, null, 2)
  }

  /**
   * Import sources from JSON
   */
  async importSources(json: string): Promise<number> {
    const sources = JSON.parse(json) as TemplateSource[]
    let imported = 0

    for (const source of sources) {
      // Generate new ID on import to avoid conflicts
      const newId = generateId()
      const importedSource: TemplateSource = {
        ...source,
        id: newId,
      }

      const validation = await this.validateSource(importedSource)
      if (validation.valid) {
        this.sources.set(newId, importedSource)
        imported++
      } else {
        logger.warn('Skipped invalid source during import', {
          name: source.name,
          errors: validation.errors,
        })
      }
    }

    logger.info('Sources imported', { total: sources.length, imported })
    return imported
  }
}

/**
 * Default singleton registry instance
 */
export const sourceRegistry = new SourceRegistry()
