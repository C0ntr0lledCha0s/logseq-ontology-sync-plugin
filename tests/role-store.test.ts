import { describe, expect, test } from 'bun:test'
import { RoleStore, type StoredRole } from '../src/logseq/role-store'
import type { LogseqLike } from '../src/logseq/types'

const role = (name: string, v = 'v1'): StoredRole => ({
  name,
  libraryVersion: v,
  presets: [],
  classOverrides: {},
  propertyOverrides: {},
})

function fake(opts: { hideFails?: boolean } = {}) {
  const calls = { createPage: [] as unknown[][], upsert: [] as unknown[][] }
  let page: { uuid: string } | null = null
  let blocks: { uuid: string; content: string }[] = []
  let n = 0
  const api = {
    Editor: {
      getPage: () => Promise.resolve(page),
      createPage: (...a: unknown[]) => {
        calls.createPage.push(a)
        page = { uuid: 'page-uuid' }
        return Promise.resolve(page)
      },
      upsertBlockProperty: (...a: unknown[]) => {
        calls.upsert.push(a)
        return opts.hideFails ? Promise.reject(new Error('nope')) : Promise.resolve()
      },
      getPageBlocksTree: () => Promise.resolve(blocks),
      appendBlockInPage: (_p: string, content: string) => {
        const b = { uuid: `b${++n}`, content }
        blocks.push(b)
        return Promise.resolve(b)
      },
      updateBlock: (uuid: string, content: string) => {
        blocks = blocks.map((b) => (b.uuid === uuid ? { ...b, content } : b))
        return Promise.resolve()
      },
      removeBlock: (uuid: string) => {
        blocks = blocks.filter((b) => b.uuid !== uuid)
        return Promise.resolve()
      },
    },
    DB: { datascriptQuery: () => Promise.resolve([]) },
  } as unknown as LogseqLike
  return { api, calls, blocks: () => blocks }
}

describe('RoleStore', () => {
  test('store-creates-hidden-page-once', async () => {
    const f = fake()
    const s = new RoleStore(f.api)
    await s.save(role('A'))
    await s.save(role('B'))
    expect(f.calls.createPage).toEqual([['Ontology Roles', {}, { redirect: false }]])
    expect(f.calls.upsert).toEqual([
      ['page-uuid', ':logseq.property/hide?', true],
      ['page-uuid', ':logseq.property/hide?', true],
    ])
    expect((await s.load()).map((r) => r.name)).toEqual(['A', 'B'])
  })

  test('store-replaces-by-name', async () => {
    const f = fake()
    const s = new RoleStore(f.api)
    await s.save(role('A'))
    await s.save(role('A', 'v2'))
    const loaded = await s.load()
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.libraryVersion).toBe('v2')
    expect(f.blocks()[0]!.content).toBe(JSON.stringify(role('A', 'v2')))
  })

  test('remove deletes the matching block', async () => {
    const f = fake()
    const s = new RoleStore(f.api)
    await s.save(role('A'))
    await s.save(role('B'))
    await s.remove('A')
    expect((await s.load()).map((r) => r.name)).toEqual(['B'])
  })

  test('load on missing page returns empty without creating it', async () => {
    const f = fake()
    expect(await new RoleStore(f.api).load()).toEqual([])
    expect(f.calls.createPage).toHaveLength(0)
  })

  test('load throws naming the block on invalid JSON', async () => {
    const f = fake()
    const s = new RoleStore(f.api)
    await s.save(role('A'))
    f.blocks().push({ uuid: 'bad-uuid', content: 'not json' })
    await expect(s.load()).rejects.toThrow('bad-uuid')
  })

  test('store-hide-failure-throws', async () => {
    const f = fake({ hideFails: true })
    await expect(new RoleStore(f.api).save(role('A'))).rejects.toThrow(
      'Could not hide the Ontology Roles page: nope'
    )
  })

  test('hide-reapplied-when-page-exists-and-failure-throws', async () => {
    const f = fake()
    const s = new RoleStore(f.api)
    await s.save(role('A'))
    f.calls.upsert.length = 0
    await s.save(role('B'))
    expect(f.calls.createPage).toHaveLength(1)
    expect(f.calls.upsert).toEqual([['page-uuid', ':logseq.property/hide?', true]])
    const g = fake()
    await new RoleStore(g.api).save(role('A'))
    ;(g.api.Editor as { upsertBlockProperty: unknown }).upsertBlockProperty = () =>
      Promise.reject(new Error('later'))
    await expect(new RoleStore(g.api).save(role('B'))).rejects.toThrow(
      'Could not hide the Ontology Roles page: later'
    )
  })

  test('load-validates-each-block', async () => {
    const f = fake()
    const s = new RoleStore(f.api)
    await s.save(role('A'))
    f.blocks().push({ uuid: 'shape-uuid', content: JSON.stringify({ name: 'x' }) })
    await expect(s.load()).rejects.toThrow('shape-uuid')
    f.blocks().pop()
    f.blocks().push({ uuid: 'name-uuid', content: JSON.stringify(role('a#b')) })
    await expect(s.load()).rejects.toThrow('name-uuid')
  })

  test('load-keeps-last-export', async () => {
    const f = fake()
    const s = new RoleStore(f.api)
    const withExport = {
      ...role('A'),
      lastExport: { properties: {}, classProperties: {}, exportedAt: 'x' },
    }
    await s.save(withExport)
    expect((await s.load())[0]).toEqual(withExport)
  })
})
