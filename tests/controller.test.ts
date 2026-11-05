import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { StoredRole } from '../src/logseq/role-store'
import { BuilderController } from '../src/ui/builder/controller'

const read = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

const stored = (name: string, extra: Partial<StoredRole> = {}): StoredRole => ({
  name,
  libraryVersion: '2.0.0',
  presets: [],
  classOverrides: {},
  propertyOverrides: {},
  ...extra,
})

/** One fake Logseq whose roles page content depends on the current graph. */
function harness() {
  const graphs: Record<string, { uuid: string; content: string }[]> = { g1: [], g2: [] }
  const state = { graph: 'g1' }
  const msgs: string[] = []
  const api = {
    Editor: {
      getPage: () => Promise.resolve({ uuid: 'page' }),
      createPage: () => Promise.resolve({ uuid: 'page' }),
      getPageBlocksTree: () => Promise.resolve(graphs[state.graph]),
      appendBlockInPage: (_p: string, content: string) => {
        graphs[state.graph]!.push({ uuid: `b${graphs[state.graph]!.length}`, content })
        return Promise.resolve(null)
      },
      updateBlock: (uuid: string, content: string) => {
        graphs[state.graph] = graphs[state.graph]!.map((b) =>
          b.uuid === uuid ? { ...b, content } : b
        )
        return Promise.resolve()
      },
      removeBlock: () => Promise.resolve(),
      upsertBlockProperty: () => Promise.resolve(),
    },
    DB: { datascriptQuery: () => Promise.resolve([]) },
  }
  const store = new Map([
    ['library.edn', read('library.edn')],
    ['presets.edn', read('presets.edn')],
    ['tag', 'v2.0.0'],
  ])
  const root = {
    innerHTML: '',
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
  }
  const noNet = (() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ tag_name: 'v2.0.0' }),
    })) as unknown as typeof fetch
  const controller = new BuilderController(root as unknown as HTMLElement, {
    api: api as never,
    source: {
      fetch: noNet,
      storage: {
        hasItem: (k) => Promise.resolve(store.has(k)),
        getItem: (k) => Promise.resolve(store.get(k)!),
        setItem: (k, v) => {
          store.set(k, v)
          return Promise.resolve()
        },
      },
    },
    showMsg: (m) => {
      msgs.push(m)
    },
    close: () => {},
    currentGraph: () => Promise.resolve(state.graph),
  })
  return { graphs, state, msgs, root, controller }
}

const priv = (c: BuilderController) => c as unknown as { role: StoredRole | null; dirty: boolean }

describe('BuilderController graph handling', () => {
  const g = globalThis as { document?: unknown }
  const before = g.document
  beforeAll(() => {
    g.document = { addEventListener: () => {} }
  })
  afterAll(() => {
    g.document = before
  })

  test('graph-switch-resets-role-and-warns-on-dirty', async () => {
    const h = harness()
    h.graphs.g1!.push({ uuid: 'a', content: JSON.stringify(stored('Alpha')) })
    h.graphs.g2!.push({ uuid: 'b', content: JSON.stringify(stored('Beta')) })
    await h.controller.open()
    expect(priv(h.controller).role?.name).toBe('Alpha')
    priv(h.controller).dirty = true

    h.state.graph = 'g2'
    await h.controller.onGraphChanged()
    expect(priv(h.controller).role?.name).toBe('Beta')
    expect(priv(h.controller).dirty).toBe(false)
    expect(h.msgs.some((m) => m.includes('discarded'))).toBe(true)
  })

  test('reopen-in-other-graph-reloads-roles', async () => {
    const h = harness()
    h.graphs.g1!.push({ uuid: 'a', content: JSON.stringify(stored('Alpha')) })
    await h.controller.open()
    h.state.graph = 'g2'
    await h.controller.open()
    expect(priv(h.controller).role).toBeNull()
    expect(h.msgs).toEqual([])
  })

  test('reopen-when-clean-retakes-stored-copy', async () => {
    const h = harness()
    h.graphs.g1!.push({ uuid: 'a', content: JSON.stringify(stored('Alpha')) })
    await h.controller.open()
    expect(priv(h.controller).role?.lastExport).toBeUndefined()
    const lastExport = { properties: {}, classProperties: {}, exportedAt: 'now' }
    h.graphs.g1![0]!.content = JSON.stringify(stored('Alpha', { lastExport }))
    await h.controller.open()
    expect(priv(h.controller).role?.lastExport).toEqual(lastExport)
  })
})

describe('BuilderController render failures', () => {
  const g = globalThis as { document?: unknown }
  const before = g.document
  beforeAll(() => {
    g.document = { addEventListener: () => {}, activeElement: null }
  })
  afterAll(() => {
    g.document = before
  })

  type Internals = {
    role: StoredRole | null
    dirty: boolean
    library: { classes: Map<string, { parents: string[] }> }
    presets: { id: string; classes: Map<string, string[]> }[]
    onAction(action: string, el: { dataset: Record<string, string> }): Promise<void>
    openRole(name: string): void
  }
  const internals = (c: BuilderController) => c as unknown as Internals

  /** Gives a class in the CRM preset a parent the library lacks, so drawing CRM throws. */
  const breakCrm = (c: BuilderController): void => {
    const lib = internals(c).library
    const crm = internals(c).presets.find((p) => p.id === 'crm')!
    const cls = [...crm.classes.keys()].find((k) => lib.classes.has(k))!
    lib.classes.get(cls)!.parents.push('custom.class/Missing')
  }

  test('a change that cannot be drawn is undone and reported', async () => {
    const h = harness()
    h.graphs.g1!.push({ uuid: 'a', content: JSON.stringify(stored('Alpha')) })
    await h.controller.open()
    breakCrm(h.controller)

    await internals(h.controller).onAction('toggle-preset', { dataset: { id: 'crm' } })

    expect(internals(h.controller).role?.presets).toEqual([])
    expect(internals(h.controller).dirty).toBe(false)
    expect(h.root.innerHTML).toContain('could not be shown, so it was undone')
    expect(h.root.innerHTML).toContain('custom.class/Missing: unknown class')
    expect(h.root.innerHTML).toContain('data-action="toggle-preset"')
  })

  test('a role that cannot be drawn shows the error with a way out', async () => {
    const h = harness()
    h.graphs.g1!.push({ uuid: 'a', content: JSON.stringify(stored('Alpha')) })
    h.graphs.g1!.push({
      uuid: 'b',
      content: JSON.stringify(stored('Broken', { presets: ['crm'] })),
    })
    await h.controller.open()
    breakCrm(h.controller)

    internals(h.controller).openRole('Broken')

    expect(h.root.innerHTML).toContain('custom.class/Missing: unknown class')
    expect(h.root.innerHTML).toContain('data-action="close"')
  })
})
