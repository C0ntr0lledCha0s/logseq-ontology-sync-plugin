import { logger } from '../utils/logger'
import { parseLibrary, parsePresets } from './parse'
import type { Library, Preset } from './types'

const RELEASE_URL =
  'https://api.github.com/repos/C0ntr0lledCha0s/logseq-template-graph/releases/latest'
// GitHub release assets send no CORS headers, so the files are read from the tagged source tree.
const RAW_BASE = 'https://raw.githubusercontent.com/C0ntr0lledCha0s/logseq-template-graph'
const rawUrl = (tag: string, file: string): string => `${RAW_BASE}/${tag}/library/${file}`
const KEY_LIBRARY = 'library.edn'
const KEY_PRESETS = 'presets.edn'
const KEY_TAG = 'tag'

export interface SourceDeps {
  fetch: typeof fetch
  storage: {
    /** Logseq's FileStorage.getItem throws for a missing key, so callers check hasItem first. */
    hasItem(key: string): Promise<boolean>
    getItem(key: string): Promise<string>
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
}

async function getOk(deps: SourceDeps, url: string): Promise<Response> {
  const res = await deps.fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed with status ${res.status}`)
  return res
}

async function latestRelease(deps: SourceDeps): Promise<Release> {
  return (await (await getOk(deps, RELEASE_URL)).json()) as Release
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
  const libraryText = await (
    await getOk(deps, rawUrl(release.tag_name, 'schema-library.edn'))
  ).text()
  const presetsText = await (
    await getOk(deps, rawUrl(release.tag_name, 'schema-presets.edn'))
  ).text()
  const parsed = parsePair(libraryText, presetsText)
  await deps.storage.setItem(KEY_LIBRARY, libraryText)
  await deps.storage.setItem(KEY_PRESETS, presetsText)
  await deps.storage.setItem(KEY_TAG, release.tag_name)
  return { ...parsed, latestTag: release.tag_name }
}

/** Use the cached library when there is one; fetch only when there is none. */
export async function loadLibrary(deps: SourceDeps): Promise<LoadedLibrary> {
  const { storage } = deps
  const cacheComplete =
    (await storage.hasItem(KEY_LIBRARY)) &&
    (await storage.hasItem(KEY_PRESETS)) &&
    (await storage.hasItem(KEY_TAG))
  if (cacheComplete) {
    const libraryText = await storage.getItem(KEY_LIBRARY)
    const presetsText = await storage.getItem(KEY_PRESETS)
    const tag = await storage.getItem(KEY_TAG)
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
