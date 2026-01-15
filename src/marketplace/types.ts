/**
 * Marketplace Types
 * Types for ontology template marketplace
 */

/**
 * A template available in the marketplace
 */
export interface MarketplaceTemplate {
  /** Unique identifier (release tag + asset name) */
  id: string
  /** Display name derived from asset filename */
  name: string
  /** Template category (content, crm, events, etc.) */
  category: string
  /** Version/release tag */
  version: string
  /** Download URL for the .edn file */
  downloadUrl: string
  /** Release date */
  publishedAt: string
  /** Size in bytes (if available) */
  size?: number
}

/**
 * A GitHub release
 */
export interface GitHubRelease {
  tag_name: string
  name: string
  published_at: string
  assets: GitHubAsset[]
}

/**
 * A GitHub release asset
 */
export interface GitHubAsset {
  name: string
  browser_download_url: string
  size: number
}

/**
 * Marketplace fetch result
 */
export interface MarketplaceFetchResult {
  templates: MarketplaceTemplate[]
  fetchedAt: string
  source: string
}
