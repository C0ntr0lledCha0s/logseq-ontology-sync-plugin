import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { checkForUpdate, loadLibrary, refreshLibrary } from '../src/library/source'

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const LIB = fx('library.edn')
const PRE = fx('presets.edn')

const memory = (init: Record<string, string> = {}) => {
  const data = new Map(Object.entries(init))
  return {
    data,
    hasItem: async (k: string) => data.has(k),
    // Like logseq.FileStorage: a missing key throws.
    getItem: async (k: string) => {
      const v = data.get(k)
      if (v === undefined) throw new Error('file not existed')
      return v
    },
    setItem: async (k: string, v: string) => {
      data.set(k, v)
    },
  }
}

const ok = (body: unknown, text = false) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => String(body) }) as Response

const RAW = (tag: string, f: string) =>
  `https://raw.githubusercontent.com/C0ntr0lledCha0s/logseq-template-graph/${tag}/library/${f}`

function fakeFetch(opts: { tag?: string; lib?: string; pre?: string } = {}) {
  const calls: string[] = []
  const tag = opts.tag ?? 'v2.0.0'
  const f = (async (url: string) => {
    calls.push(url)
    if (url.includes('/releases/latest')) return ok({ tag_name: tag })
    if (url === RAW(tag, 'schema-library.edn')) return ok(opts.lib ?? LIB)
    if (url === RAW(tag, 'schema-presets.edn')) return ok(opts.pre ?? PRE)
    return { ok: false, status: 404 } as Response
  }) as unknown as typeof fetch
  return { f, calls }
}

const cached = () => memory({ 'library.edn': LIB, 'presets.edn': PRE, tag: 'v1.0.0' })

describe('loadLibrary', () => {
  test('uses-cache-when-present', async () => {
    const { f, calls } = fakeFetch()
    const r = await loadLibrary({ fetch: f, storage: cached() })
    expect(r.fromCache).toBe(true)
    expect(r.latestTag).toBe('v1.0.0')
    expect(calls).toEqual([])
    expect(r.library.classes.size).toBeGreaterThan(0)
  })

  test('fetches-when-no-cache', async () => {
    const { f, calls } = fakeFetch()
    const storage = memory()
    const r = await loadLibrary({ fetch: f, storage })
    expect(calls).toEqual([
      'https://api.github.com/repos/C0ntr0lledCha0s/logseq-template-graph/releases/latest',
      RAW('v2.0.0', 'schema-library.edn'),
      RAW('v2.0.0', 'schema-presets.edn'),
    ])
    expect(r.fromCache).toBe(false)
    expect(r.latestTag).toBe('v2.0.0')
    expect(storage.data.get('library.edn')).toBe(LIB)
    expect(storage.data.get('presets.edn')).toBe(PRE)
    expect(storage.data.get('tag')).toBe('v2.0.0')
  })

  test('throws-without-cache-offline', async () => {
    const f = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    await expect(loadLibrary({ fetch: f, storage: memory() })).rejects.toThrow(
      'Schema library unavailable: offline'
    )
  })

  test('version-mismatch-throws', async () => {
    const { f } = fakeFetch({
      pre: PRE.replace(/:schema-library\/version\s+"[^"]*"/, ':schema-library/version "9.9.9"'),
    })
    const storage = memory()
    await expect(loadLibrary({ fetch: f, storage })).rejects.toThrow(/version/i)
    expect(storage.data.size).toBe(0)
  })

  test('http-errors-throw-with-status-and-url', async () => {
    const bad = (async () => ({ ok: false, status: 503 }) as Response) as unknown as typeof fetch
    await expect(loadLibrary({ fetch: bad, storage: memory() })).rejects.toThrow('503')
    const noFile = (async (url: string) =>
      url.includes('/releases/latest')
        ? ok({ tag_name: 'v2.0.0' })
        : ({ ok: false, status: 404 } as Response)) as unknown as typeof fetch
    await expect(loadLibrary({ fetch: noFile, storage: memory() })).rejects.toThrow(
      RAW('v2.0.0', 'schema-library.edn')
    )
  })

  test('partial-cache-fetches', async () => {
    const { f, calls } = fakeFetch()
    const storage = memory({ 'library.edn': LIB, tag: 'v1.0.0' })
    const r = await loadLibrary({ fetch: f, storage })
    expect(r.fromCache).toBe(false)
    expect(calls.length).toBe(3)
    expect(storage.data.get('presets.edn')).toBe(PRE)
  })

  test('corrupt-cache-throws-and-refresh-recovers', async () => {
    const { f } = fakeFetch()
    const storage = memory({ 'library.edn': '{{{', 'presets.edn': PRE, tag: 'v1.0.0' })
    await expect(loadLibrary({ fetch: f, storage })).rejects.toThrow()
    const r = await refreshLibrary({ fetch: f, storage })
    expect(r.latestTag).toBe('v2.0.0')
    expect((await loadLibrary({ fetch: f, storage })).fromCache).toBe(true)
  })
})

describe('refreshLibrary and checkForUpdate', () => {
  test('refresh-replaces-cache', async () => {
    const { f } = fakeFetch({ tag: 'v3.0.0' })
    const storage = cached()
    const r = await refreshLibrary({ fetch: f, storage })
    expect(r.latestTag).toBe('v3.0.0')
    expect(storage.data.get('tag')).toBe('v3.0.0')
  })

  test('update-detected', async () => {
    const { f } = fakeFetch({ tag: 'v2.0.0' })
    const deps = { fetch: f, storage: cached() }
    expect(await checkForUpdate('v1.0.0', deps)).toBe('v2.0.0')
    expect(await checkForUpdate('v2.0.0', deps)).toBeNull()
    expect(deps.storage.data.get('tag')).toBe('v1.0.0')
  })

  test('update-check-null-on-network-failure', async () => {
    const f = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await checkForUpdate('v1.0.0', { fetch: f, storage: memory() })).toBeNull()
  })
})
