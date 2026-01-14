/**
 * Source Fetcher Module
 * Handles fetching content from local files and URLs
 */

import { logger } from '../utils/logger'
import type { TemplateSource, FetchResult } from './types'
import { FetchError } from './types'

/**
 * Source Fetcher for retrieving template content
 */
export class SourceFetcher {
  private timeout: number

  constructor(timeoutMs: number = 30000) {
    this.timeout = timeoutMs
    logger.debug('SourceFetcher initialized', { timeout: timeoutMs })
  }

  /**
   * Fetch content from a source
   */
  async fetch(source: TemplateSource): Promise<FetchResult> {
    logger.info('Fetching source', { id: source.id, name: source.name, type: source.type })

    let content: string

    try {
      if (source.type === 'local') {
        content = await this.fetchLocal(source.location)
      } else if (source.type === 'url') {
        content = await this.fetchUrl(source.location)
      } else {
        throw new Error(`Unsupported source type: ${source.type as string}`)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error'
      logger.error('Fetch failed', error, { source: source.id })
      throw new FetchError(message, source)
    }

    const checksum = this.computeChecksum(content)
    const fetchedAt = new Date().toISOString()

    logger.info('Source fetched successfully', {
      id: source.id,
      contentLength: content.length,
      checksum: checksum.substring(0, 8) + '...',
    })

    return {
      content,
      checksum,
      fetchedAt,
      source,
    }
  }

  /**
   * Fetch content from a local file path
   */
  async fetchLocal(path: string): Promise<string> {
    logger.debug('Fetching local file', { path })

    try {
      // Use Bun's file API for reading local files
      const file = Bun.file(path)

      // Check if file exists
      const exists = await file.exists()
      if (!exists) {
        throw new Error(`File not found: ${path}`)
      }

      const content = await file.text()

      if (!content || content.trim().length === 0) {
        throw new Error(`File is empty: ${path}`)
      }

      logger.debug('Local file read successfully', {
        path,
        size: content.length,
      })

      return content
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file'
      throw new Error(`Local fetch failed: ${message}`)
    }
  }

  /**
   * Fetch content from a URL
   */
  async fetchUrl(url: string): Promise<string> {
    logger.debug('Fetching URL', { url })

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'text/plain, application/edn, */*',
          'User-Agent': 'Logseq-Ontology-Sync/1.0',
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const content = await response.text()

      if (!content || content.trim().length === 0) {
        throw new Error('Remote file is empty')
      }

      logger.debug('URL fetched successfully', {
        url,
        status: response.status,
        size: content.length,
      })

      return content
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${this.timeout}ms`)
      }
      const message = error instanceof Error ? error.message : 'Failed to fetch URL'
      throw new Error(`URL fetch failed: ${message}`)
    }
  }

  /**
   * Compute SHA-256 checksum of content
   */
  computeChecksum(content: string): string {
    // Use Bun's native crypto for hashing
    const hasher = new Bun.CryptoHasher('sha256')
    hasher.update(content)
    return hasher.digest('hex')
  }

  /**
   * Verify content against expected checksum
   */
  verifyChecksum(content: string, expectedChecksum: string): boolean {
    const actualChecksum = this.computeChecksum(content)
    const isValid = actualChecksum === expectedChecksum

    if (!isValid) {
      logger.warn('Checksum mismatch', {
        expected: expectedChecksum.substring(0, 8) + '...',
        actual: actualChecksum.substring(0, 8) + '...',
      })
    }

    return isValid
  }

  /**
   * Fetch multiple sources in parallel
   */
  async fetchAll(sources: TemplateSource[]): Promise<Map<string, FetchResult | Error>> {
    const results = new Map<string, FetchResult | Error>()

    const promises = sources.map(async (source) => {
      try {
        const result = await this.fetch(source)
        results.set(source.id, result)
      } catch (error) {
        results.set(source.id, error instanceof Error ? error : new Error('Unknown error'))
      }
    })

    await Promise.all(promises)

    logger.info('Batch fetch completed', {
      total: sources.length,
      successful: Array.from(results.values()).filter((r) => !(r instanceof Error)).length,
      failed: Array.from(results.values()).filter((r) => r instanceof Error).length,
    })

    return results
  }

  /**
   * Check if a source is reachable
   */
  async isReachable(source: TemplateSource): Promise<boolean> {
    try {
      if (source.type === 'local') {
        const file = Bun.file(source.location)
        return await file.exists()
      } else if (source.type === 'url') {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // Quick check

        const response = await fetch(source.location, {
          method: 'HEAD',
          signal: controller.signal,
        })

        clearTimeout(timeoutId)
        return response.ok
      }
      return false
    } catch {
      return false
    }
  }
}

/**
 * Default singleton fetcher instance
 */
export const sourceFetcher = new SourceFetcher()
