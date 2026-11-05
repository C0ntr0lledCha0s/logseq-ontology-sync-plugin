import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { readEdn } from '../src/edn/read'
import { writeEdn } from '../src/edn/write'
import { isMap, kw, mapGet, type EdnMap } from '../src/edn/value'
import { parseLibrary, parsePresets } from '../src/library/parse'
import { buildExport, exportFileName, snapshotOf } from '../src/role/export'
import { computeSelection } from '../src/role/selection'
import type { RoleDefinition } from '../src/role/types'

const read = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const lib = parseLibrary(read('library.edn'))
const { presets } = parsePresets(read('presets.edn'))

const role = (over: Partial<RoleDefinition> = {}): RoleDefinition => ({
  name: 'r',
  libraryVersion: '2.0.0',
  presets: [],
  classOverrides: {},
  propertyOverrides: {},
  ...over,
})
const build = (over: Partial<RoleDefinition>) =>
  buildExport(lib, computeSelection(lib, presets, role(over)))
const section = (edn: EdnMap, key: string): EdnMap => {
  const v = mapGet(edn, key)
  if (!isMap(v)) throw new Error(`no ${key}`)
  return v
}
const keys = (m: EdnMap): string[] => [...m.keys()].map((k) => (k as { kw: string }).kw)

describe('export', () => {
  test('exports-trimmed-class-properties', () => {
    const { edn } = build({
      classOverrides: { 'schema.class/Person': 'on' },
      propertyOverrides: { 'schema.class/Person|schema.property/email': 'on' },
    })
    const person = section(edn, 'classes').get(kw('schema.class/Person')) as EdnMap
    expect(mapGet(person, 'build/class-properties')).toEqual([kw('schema.property/email')])
  })

  test('ancestors-exported', () => {
    const { edn } = build({ classOverrides: { 'schema.class/Person': 'on' } })
    expect(keys(section(edn, 'classes'))).toEqual(['schema.class/Thing', 'schema.class/Person'])
  })

  test('built-in-parent-kept-but-not-exported', () => {
    const pm = parseLibrary(
      '{:schema-library/version "1" :properties {} :classes {:custom.class/PMItem {:block/title "PM Item"} :custom.class/WorkItem {:block/title "Work Item" :build/class-extends [:custom.class/PMItem :logseq.class/Task]}}}',
    )
    const { edn } = buildExport(pm, computeSelection(pm, [], role({ classOverrides: { 'custom.class/WorkItem': 'on' } })))
    const classes = section(edn, 'classes')
    expect(keys(classes).sort()).toEqual(['custom.class/PMItem', 'custom.class/WorkItem'])
    expect(mapGet(classes.get(kw('custom.class/WorkItem')) as EdnMap, 'build/class-extends')).toEqual([
      kw('custom.class/PMItem'),
      kw('logseq.class/Task'),
    ])
  })

  test('build-properties-keys-pulled-in', () => {
    const { edn } = build({ classOverrides: { 'schema.class/Event': 'on' } })
    expect(keys(section(edn, 'properties'))).toContain('schema.property/url')
  })

  test('node-targets-filtered-or-dropped', () => {
    const worksFor = (over: Partial<RoleDefinition>) => {
      const { edn, notes } = build(over)
      return {
        notes,
        def: section(edn, 'properties').get(kw('schema.property/worksFor')) as EdnMap,
      }
    }
    const off = worksFor({
      presets: ['crm'],
      classOverrides: { 'schema.class/Organization': 'off' },
    })
    expect(mapGet(off.def, 'build/property-classes')).toBeUndefined()
    expect(off.notes.some((n) => n.includes('worksFor'))).toBe(true)
    const on = worksFor({ presets: ['crm'] })
    expect(mapGet(on.def, 'build/property-classes')).toEqual([kw('schema.class/Organization')])
    expect(on.notes).toEqual([])
  })

  test('no-version-key', () => {
    const { edn } = build({ presets: ['crm'] })
    expect(mapGet(edn, 'schema-library/version')).toBeUndefined()
    expect(mapGet(edn, 'logseq.db.sqlite.export/export-type')).toEqual(kw('graph-ontology'))
  })

  test('output-round-trips', () => {
    const { edn } = build({ presets: ['crm', 'events'] })
    expect(readEdn(writeEdn(edn))).toEqual(edn)
  })

  test('file-name', () => {
    expect(exportFileName('Client Work!')).toBe('client-work.edn')
    expect(exportFileName('!!!')).toBe('schema.edn')
  })

  test('snapshot', () => {
    const sel = computeSelection(lib, presets, role({ presets: ['crm'] }))
    const snap = snapshotOf(lib, sel)
    expect(snap.properties['schema.property/email']).toEqual({
      type: 'default',
      cardinality: 'many',
    })
    expect(snap.classProperties['schema.class/Person']).toEqual([
      'schema.property/email',
      'schema.property/worksFor',
    ])
    expect(snap.classProperties['schema.class/Thing']).toEqual([])
  })
})
