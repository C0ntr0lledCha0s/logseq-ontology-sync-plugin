/**
 * Template Source Types
 * Type definitions for template source management
 */

/**
 * Supported source types
 */
export type SourceType = 'local' | 'url'

/**
 * Template source configuration
 */
export interface TemplateSource {
  /** Unique identifier for the source */
  id: string
  /** Human-readable name */
  name: string
  /** Type of source (local file or URL) */
  type: SourceType
  /** Path or URL to the template */
  location: string
  /** Optional description of the source */
  description?: string
  /** Optional version string */
  version?: string
  /** ISO timestamp of last fetch */
  lastFetched?: string
  /** SHA-256 checksum of content */
  checksum?: string
  /** Whether the source is enabled */
  enabled: boolean
}

/**
 * Result of fetching content from a source
 */
export interface FetchResult {
  /** The raw content fetched */
  content: string
  /** SHA-256 checksum of the content */
  checksum: string
  /** ISO timestamp of when content was fetched */
  fetchedAt: string
  /** The source that was fetched */
  source: TemplateSource
}

/**
 * Validation result for a source
 */
export interface ValidationResult {
  /** Whether the source is valid */
  valid: boolean
  /** List of error messages if invalid */
  errors: string[]
  /** List of warning messages */
  warnings: string[]
}

/**
 * Input for creating a new source (without id)
 */
export type SourceInput = Omit<TemplateSource, 'id'>

/**
 * Partial update for an existing source
 */
export type SourceUpdate = Partial<Omit<TemplateSource, 'id'>>

/**
 * Error thrown when a source is not found
 */
export class SourceNotFoundError extends Error {
  constructor(id: string) {
    super(`Source not found: ${id}`)
    this.name = 'SourceNotFoundError'
  }
}

/**
 * Error thrown when fetching fails
 */
export class FetchError extends Error {
  constructor(
    message: string,
    public readonly source: TemplateSource
  ) {
    super(message)
    this.name = 'FetchError'
  }
}

/**
 * Error thrown when validation fails
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: string[]
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}
