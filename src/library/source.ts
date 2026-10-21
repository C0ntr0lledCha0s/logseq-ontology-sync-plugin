import { logger } from '../utils/logger'
import { parseLibrary, parsePresets } from './parse'
import type { Library, Preset } from './types'

const RELEASE_URL =
  'https://api.github.com/repos/C0ntr0lledCha0s/logseq-template-graph/releases/latest'
const LIBRARY_ASSET = 'schema-library.edn'
const PRESETS_ASSET = 'schema-presets.edn'
const KEY_LIBRARY = 'library.edn'
const KEY_PRESETS = 'presets.edn'
const KEY_TAG = 'tag'

export interface SourceDeps {
  fetch: typeof fetch
  storage: {
    getItem(key: string): Promise<string | undefined>
    setItem(key: string, value: string): Promise<void>
  }
}

export interface LoadedLibrary {
  library: Library
  presets: Preset[]
  fromCache: boolean
  latestTag: string
}

interface Release {
  tag_name: string
  assets: { name: string; browser_download_url: string }[]
}

async function getOk(deps: SourceDeps, url: string): Promise<Response> {
  const res = await deps.fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed with status ${res.status}`)
  return res
}

async function latestRelease(deps: SourceDeps): Promise<Release> {
  return (await (await getOk(deps, RELEASE_URL)).json()) as Release
}

async function downloadAsset(deps: SourceDeps, release: Release, name: string): Promise<string> {
  const asset = release.assets.find((a) => a.name === name)
  if (!asset) throw new Error(`Release ${release.tag_name} has no asset ${name}`)
  return (await getOk(deps, asset.browser_download_url)).text()
}

function parsePair(libraryText: string, presetsText: string) {
  const library = parseLibrary(libraryText)
  const presets = parsePresets(presetsText)
  if (library.version !== presets.version) {
    throw new Error(
      `Library version ${library.version} does not match presets version ${presets.version}`
    )
  }
  return { library, presets: presets.presets }
}

/** Always fetch the latest release and replace the cache. Only an explicit user action calls this. */
export async function refreshLibrary(
  deps: SourceDeps
): Promise<{ library: Library; presets: Preset[]; latestTag: string }> {
  const release = await latestRelease(deps)
  const libraryText = await downloadAsset(deps, release, LIBRARY_ASSET)
  const presetsText = await downloadAsset(deps, release, PRESETS_ASSET)
  const parsed = parsePair(libraryText, presetsText)
  await deps.storage.setItem(KEY_LIBRARY, libraryText)
  await deps.storage.setItem(KEY_PRESETS, presetsText)
  await deps.storage.setItem(KEY_TAG, release.tag_name)
  return { ...parsed, latestTag: release.tag_name }
}

/** Use the cached library when there is one; fetch only when there is none. */
export async function loadLibrary(deps: SourceDeps): Promise<LoadedLibrary> {
  const libraryText = await deps.storage.getItem(KEY_LIBRARY)
  const presetsText = await deps.storage.getItem(KEY_PRESETS)
  const tag = await deps.storage.getItem(KEY_TAG)
  if (libraryText !== undefined && presetsText !== undefined && tag !== undefined) {
    return { ...parsePair(libraryText, presetsText), fromCache: true, latestTag: tag }
  }
  try {
    return { ...(await refreshLibrary(deps)), fromCache: false }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error('Schema library unavailable: ' + msg)
  }
}

/** The latest release tag when it differs from `currentTag`, else null. Never throws. */
export async function checkForUpdate(currentTag: string, deps: SourceDeps): Promise<string | null> {
  try {
    const { tag_name } = await latestRelease(deps)
    return tag_name !== currentTag ? tag_name : null
  } catch (e) {
    logger.warn('Library update check failed', e)
    return null
  }
}
