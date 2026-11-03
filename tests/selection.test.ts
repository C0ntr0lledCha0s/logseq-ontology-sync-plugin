import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parseLibrary, parsePresets } from '../src/library/parse'
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
const crm = { kind: 'preset', id: 'crm' } as const
const events = { kind: 'preset', id: 'events' } as const

const Person = 'schema.class/Person'
const prop = (sel: ReturnType<typeof computeSelection>, cls: string, p: string) =>
  sel.classes.get(cls)?.properties.find((x) => x.ident === p)

describe('selection', () => {
  test('union-of-presets', () => {
    const sel = computeSelection(lib, presets, role({ presets: ['crm', 'events'] }))
    expect(prop(sel, Person, 'schema.property/email')).toMatchObject({
      on: true,
      sources: [crm, events],
    })
    expect(prop(sel, Person, 'schema.property/worksFor')).toMatchObject({
      on: true,
      sources: [crm],
    })
    expect(prop(sel, 'schema.class/Event', 'schema.property/organizer')?.on).toBe(true)
    expect(sel.classes.get('schema.class/Thing')).toMatchObject({
      on: true,
      sources: [{ kind: 'parent' }],
    })
    expect(sel.classes.get(Person)?.sources).toEqual([crm, events])
    expect([...sel.classes.keys()]).toEqual([
      'schema.class/Thing',
      Person,
      'schema.class/Organization',
      'schema.class/Event',
    ])
    expect(sel.missing).toEqual([])
  })

  test('property-override-off', () => {
    const sel = computeSelection(
      lib,
      presets,
      role({
        presets: ['crm', 'events'],
        propertyOverrides: { 'schema.class/Person|schema.property/email': 'off' },
      })
    )
    expect(prop(sel, Person, 'schema.property/email')).toEqual({
      ident: 'schema.property/email',
      on: false,
      sources: [crm, events],
      userOverride: 'off',
    })
  })

  test('user-on-survives-preset-untick', () => {
    const sel = computeSelection(
      lib,
      presets,
      role({
        classOverrides: { [Person]: 'on' },
        propertyOverrides: { 'schema.class/Person|schema.property/spouse': 'on' },
      })
    )
    expect(sel.classes.get(Person)).toMatchObject({
      on: true,
      sources: [{ kind: 'user' }],
      userOverride: 'on',
    })
    expect(prop(sel, Person, 'schema.property/spouse')).toEqual({
      ident: 'schema.property/spouse',
      on: true,
      sources: [{ kind: 'user' }],
      userOverride: 'on',
    })
    expect(prop(sel, Person, 'schema.property/email')?.on).toBe(false)
    expect(sel.classes.get('schema.class/Thing')?.sources).toEqual([{ kind: 'parent' }])
  })

  test('parent-properties-default-off', () => {
    const base = computeSelection(lib, presets, role({ presets: ['crm'] }))
    const thing = base.classes.get('schema.class/Thing')
    expect(thing?.properties.map((p) => [p.ident, p.on])).toEqual([
      ['schema.property/url', false],
      ['schema.property/name', false],
    ])
    const over = computeSelection(
      lib,
      presets,
      role({
        presets: ['crm'],
        propertyOverrides: { 'schema.class/Thing|schema.property/url': 'on' },
      })
    )
    expect(prop(over, 'schema.class/Thing', 'schema.property/url')?.on).toBe(true)
  })

  test('class-off-kept-listed', () => {
    const sel = computeSelection(
      lib,
      presets,
      role({ presets: ['crm'], classOverrides: { 'schema.class/Organization': 'off' } })
    )
    expect(sel.classes.get('schema.class/Organization')).toMatchObject({
      on: false,
      sources: [crm],
      userOverride: 'off',
    })
  })

  test('missing-idents-reported', () => {
    const sel = computeSelection(
      lib,
      presets,
      role({
        presets: ['crm', 'nope'],
        classOverrides: { 'schema.class/Gone': 'on' },
        propertyOverrides: {
          'schema.class/Person|schema.property/legalName': 'on',
          'schema.class/Gone|schema.property/x': 'on',
        },
      })
    )
    expect(sel.missing).toContain('schema.class/Gone')
    expect(sel.missing).toContain('preset:nope')
    expect(sel.missing).toContain('schema.class/Person|schema.property/legalName')
    expect(sel.classes.has('schema.class/Gone')).toBe(false)
    expect(new Set(sel.missing).size).toBe(sel.missing.length)
  })
})
