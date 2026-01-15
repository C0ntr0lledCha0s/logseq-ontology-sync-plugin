/**
 * GitHub Releases Marketplace
 * Fetches ontology templates from GitHub releases
 */

import { logger } from '../utils/logger'
import type { MarketplaceTemplate, GitHubRelease, MarketplaceFetchResult } from './types'

/** Default marketplace repository */
const DEFAULT_REPO = 'C0ntr0lledCha0s/logseq-template-graph'

/**
 * Parse template name from asset filename
 * e.g., "logseq_db_Templates_content.edn" -> { name: "Content Templates", category: "content" }
 */
function parseAssetName(filename: string): { name: string; category: string } {
  // Remove prefix and extension
  const base = filename.replace(/^logseq_db_Templates_/, '').replace(/\.edn$/, '')

  // Capitalize and format
  const category = base.toLowerCase()
  const name = base.charAt(0).toUpperCase() + base.slice(1) + ' Templates'

  return { name, category }
}

/**
 * Fetch templates from a GitHub releases API
 */
export async function fetchMarketplaceTemplates(
  repo: string = DEFAULT_REPO
): Promise<MarketplaceFetchResult> {
  const apiUrl = `https://api.github.com/repos/${repo}/releases`

  logger.info('Fetching marketplace templates', { repo, apiUrl })

  try {
    const response = await fetch(apiUrl, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Logseq-Ontology-Sync/1.0',
      },
    })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }

    const releases = (await response.json()) as GitHubRelease[]

    if (!releases || releases.length === 0) {
      logger.warn('No releases found in repository', { repo })
      return {
        templates: [],
        fetchedAt: new Date().toISOString(),
        source: repo,
      }
    }

    // Get the latest release (we know it exists from the check above)
    const latestRelease = releases[0]!
    const templates: MarketplaceTemplate[] = []

    for (const asset of latestRelease.assets) {
      // Only include .edn files
      if (!asset.name.endsWith('.edn')) {
        continue
      }

      const { name, category } = parseAssetName(asset.name)

      templates.push({
        id: `${latestRelease.tag_name}/${asset.name}`,
        name,
        category,
        version: latestRelease.tag_name,
        downloadUrl: asset.browser_download_url,
        publishedAt: latestRelease.published_at,
        size: asset.size,
      })
    }

    logger.info('Marketplace templates fetched', {
      repo,
      version: latestRelease.tag_name,
      count: templates.length,
    })

    return {
      templates,
      fetchedAt: new Date().toISOString(),
      source: repo,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Failed to fetch marketplace templates', error, { repo })
    throw new Error(`Failed to fetch marketplace: ${message}`)
  }
}

/**
 * Fetch content from a template URL
 */
export async function fetchTemplateContent(url: string): Promise<string> {
  logger.info('Fetching template content', { url })

  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain, application/edn, */*',
      'User-Agent': 'Logseq-Ontology-Sync/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch template: ${response.status} ${response.statusText}`)
  }

  const content = await response.text()

  if (!content || content.trim().length === 0) {
    throw new Error('Template file is empty')
  }

  logger.info('Template content fetched', { url, size: content.length })

  return content
}
