/**
 * Source Fetcher Module
 * Handles fetching content from local files and URLs
 */

import { logger } from '../utils/logger'
import { detectFeatures, hasFileSystem } from '../utils/environment'
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
   * @remarks
   * - In browser environments: Not supported (use file picker UI)
   * - In Node/Bun environments: Uses fs module for testing
   */
  async fetchLocal(path: string): Promise<string> {
    // Check if file system access is available
    if (!hasFileSystem()) {
      const features = detectFeatures()
      logger.warn('Local file access not available', {
        isBrowser: features.isBrowser,
        path,
      })

      return Promise.reject(
        new Error(
          'Automatic local file fetching is not supported in browser environment. ' +
            'Use the import command to select files manually, or convert to a URL source.'
        )
      )
    }

    // In Node/Bun environments, use dynamic import for fs
    try {
      logger.debug('Fetching local file', { path })

      // Dynamic import to avoid bundling issues
      const fs = await import('fs/promises')
      const content = await fs.readFile(path, 'utf-8')

      if (!content || content.trim().length === 0) {
        throw new Error('Local file is empty')
      }

      logger.debug('Local file fetched successfully', {
        path,
        size: content.length,
      })

      return content
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read local file'
      throw new Error(`Local file fetch failed: ${message}`)
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
   * @remarks
   * - Local sources: Available in Node/Bun, not in browser
   * - URL sources: Checks via HEAD request
   */
  async isReachable(source: TemplateSource): Promise<boolean> {
    try {
      if (source.type === 'local') {
        // Check if file system is available
        if (!hasFileSystem()) {
          return false
        }
        // In Node/Bun, check if file exists
        try {
          const fs = await import('fs/promises')
          await fs.access(source.location)
          return true
        } catch {
          return false
        }
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
