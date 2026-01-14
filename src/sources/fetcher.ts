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

    const checksum = await this.computeChecksum(content)
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
   *
   * Note: Automatic local file fetching is not supported in browser environment.
   * Users should use the file picker UI to select files manually.
   */
  async fetchLocal(_path: string): Promise<string> {
    // Local file fetching is not supported in browser environment
    // The Logseq plugin runs in a browser context where direct filesystem
    // access is restricted for security reasons.
    //
    // For local files, users should:
    // 1. Use the import command with file picker
    // 2. Convert local sources to URL sources (serve files via local server)
    // 3. Use the Logseq assets folder which is accessible via URL
    throw new Error(
      'Automatic local file fetching is not supported in browser environment. ' +
        'Use the import command to select files manually, or convert to a URL source.'
    )
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
   * Uses Web Crypto API for browser compatibility
   */
  async computeChecksum(content: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  /**
   * Verify content against expected checksum
   */
  async verifyChecksum(content: string, expectedChecksum: string): Promise<boolean> {
    const actualChecksum = await this.computeChecksum(content)
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
   *
   * Note: Local sources always return false in browser environment
   * since we cannot check local file existence.
   */
  async isReachable(source: TemplateSource): Promise<boolean> {
    try {
      if (source.type === 'local') {
        // Cannot check local file existence in browser environment
        // Return false to indicate the source cannot be automatically accessed
        return false
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
