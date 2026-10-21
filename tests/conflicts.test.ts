import { describe, expect, test } from 'bun:test'
import { removals, typeConflicts } from '../src/role/conflicts'
import { readLivePropertySchemas } from '../src/logseq/live-graph'
import type { ExportSnapshot } from '../src/role/export'
import type { LogseqLike } from '../src/logseq/types'

const snap = (
  properties: ExportSnapshot['properties'],
  classProperties: ExportSnapshot['classProperties'] = {}
): ExportSnapshot => ({ properties, classProperties })

describe('typeConflicts', () => {
  test('type-conflict-detected', () => {
    const s = snap({ 'schema.property/skills': { type: 'default', cardinality: 'one' } })
    const live = new Map([['schema.property/skills', { type: 'number', cardinality: 'one' as const }]])
    expect(typeConflicts(s, live)).toEqual([
      { ident: 'schema.property/skills', exported: 'default/one', graph: 'number/one' },
    ])
  })
  test('cardinality-conflict-detected', () => {
    const s = snap({ 'schema.property/skills': { type: 'default', cardinality: 'one' } })
    const live = new Map([['schema.property/skills', { type: 'default', cardinality: 'many' as const }]])
    expect(typeConflicts(s, live)).toHaveLength(1)
  })
  test('absent-in-graph-not-conflict', () => {
    const s = snap({ 'schema.property/skills': { type: 'default', cardinality: 'one' } })
    expect(typeConflicts(s, new Map())).toEqual([])
  })
})

describe('removals', () => {
  test('removals-listed', () => {
    const prev = snap({}, { 'schema.class/Person': ['schema.property/spouse', 'schema.property/email'], 'schema.class/Org': [] })
    const next = snap({}, { 'schema.class/Person': ['schema.property/email'] })
    expect(removals(prev, next)).toEqual({
      classes: ['schema.class/Org'],
      classProperties: ['schema.class/Person|schema.property/spouse'],
    })
  })
  test('no previous means no removals', () => {
    expect(removals(undefined, snap({}))).toEqual({ classes: [], classProperties: [] })
  })
})

describe('readLivePropertySchemas', () => {
  test('live-query-mapping', async () => {
    const api = {
      DB: {
        datascriptQuery: () =>
          Promise.resolve([
            ['schema.property/email', 'default', 'db.cardinality/one'],
            ['logseq.property/x', 'default', 'db.cardinality/one'],
            ['custom.property/tags', 'default', 'db.cardinality/many'],
          ]),
      },
    } as unknown as LogseqLike
    const m = await readLivePropertySchemas(api)
    expect([...m.keys()]).toEqual(['schema.property/email', 'custom.property/tags'])
    expect(m.get('schema.property/email')).toEqual({ type: 'default', cardinality: 'one' })
    expect(m.get('custom.property/tags')).toEqual({ type: 'default', cardinality: 'many' })
  })
})
