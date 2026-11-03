import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parseLibrary, parsePresets } from '../src/library/parse'
import { computeSelection } from '../src/role/selection'
import type { RoleDefinition } from '../src/role/types'
import { toViewModel } from '../src/ui/builder/view-model'

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
const vmFor = (r: RoleDefinition) => toViewModel(lib, presets, r, computeSelection(lib, presets, r))

const Person = 'schema.class/Person'
const section = (vm: ReturnType<typeof vmFor>, cls: string) => {
  const s = vm.sections.find((x) => x.ident === cls)
  if (!s) throw new Error(`no section ${cls}`)
  return s
}
const row = (vm: ReturnType<typeof vmFor>, cls: string, p: string) => {
  const r = section(vm, cls).rows.find((x) => x.ident === p)
  if (!r) throw new Error(`no row ${p}`)
  return r
}

describe('view model', () => {
  test('counts-per-class', () => {
    const vm = vmFor(role({ presets: ['crm'] }))
    const entry = vm.contents.find((c) => c.ident === Person)
    expect(entry).toMatchObject({ onCount: 2, total: 3, on: true })
    expect(vm.presetChips).toEqual([
      { id: 'crm', name: 'CRM', selected: true },
      { id: 'events', name: 'Events', selected: false },
    ])
  })

  test('tags-carry-sources', () => {
    const vm = vmFor(role({ presets: ['crm', 'events'], propertyOverrides: {} }))
    expect(section(vm, Person).tags).toEqual([
      { label: 'CRM', kind: 'preset' },
      { label: 'Events', kind: 'preset' },
    ])
    expect(row(vm, Person, 'schema.property/email').tags).toEqual([
      { label: 'CRM', kind: 'preset' },
      { label: 'Events', kind: 'preset' },
    ])
    expect(section(vm, 'schema.class/Thing').tags).toEqual([{ label: 'parent', kind: 'parent' }])
    const added = vmFor(
      role({
        presets: ['crm'],
        propertyOverrides: { [`${Person}|schema.property/spouse`]: 'on' },
      })
    )
    expect(row(added, Person, 'schema.property/spouse').tags).toEqual([
      { label: 'added by you', kind: 'user' },
    ])
  })

  test('off-by-you-flag', () => {
    const vm = vmFor(
      role({ presets: ['crm'], propertyOverrides: { [`${Person}|schema.property/email`]: 'off' } })
    )
    const r = row(vm, Person, 'schema.property/email')
    expect(r).toMatchObject({ on: false, offByYou: true, notInPreset: false })
    expect(r.tags).toEqual([{ label: 'CRM', kind: 'preset' }])
  })

  test('not-in-preset-flag', () => {
    const vm = vmFor(role({ presets: ['crm'] }))
    const r = row(vm, Person, 'schema.property/worksFor')
    expect(r).toMatchObject({ on: true, notInPreset: false, offByYou: false })
    const vm2 = vmFor(role({ presets: ['events'] }))
    expect(row(vm2, Person, 'schema.property/spouse')).toMatchObject({
      on: false,
      notInPreset: true,
      offByYou: false,
    })
  })

  test('node-type-label', () => {
    const vm = vmFor(role({ presets: ['crm'] }))
    expect(row(vm, Person, 'schema.property/worksFor').typeLabel).toBe('→ Organization')
    expect(row(vm, Person, 'schema.property/email').typeLabel).toBe('text')
    const ev = vmFor(role({ presets: ['events'] }))
    expect(row(ev, 'schema.class/Event', 'schema.property/organizer').typeLabel).toBe(
      '→ Person, Organization'
    )
  })

  test('contents-depth', () => {
    const vm = vmFor(role({ classOverrides: { 'schema.class/BusinessMeeting': 'on' } }))
    const depth = (c: string) => vm.contents.find((x) => x.ident === c)?.depth
    expect(depth('schema.class/Thing')).toBe(0)
    expect(depth('schema.class/Event')).toBe(1)
    expect(depth('schema.class/BusinessMeeting')).toBe(2)
  })

  test('contents-depth-first-hierarchy-order', () => {
    const text = read('library.edn').replace(
      ':schema.class/BusinessMeeting {',
      ':schema.class/Aardvark {:block/title "Aardvark" :build/class-extends [:schema.class/Person]}\n  :schema.class/BusinessMeeting {'
    )
    const lib2 = parseLibrary(text)
    // Library order is Thing, Person, Organization, Event, Aardvark, BusinessMeeting.
    const r = role({
      classOverrides: {
        'schema.class/Aardvark': 'on',
        'schema.class/BusinessMeeting': 'on',
        'schema.class/Organization': 'on',
      },
    })
    const vm = toViewModel(lib2, presets, r, computeSelection(lib2, presets, r))
    expect(vm.contents.map((c) => c.ident)).toEqual([
      'schema.class/Thing',
      'schema.class/Person',
      'schema.class/Aardvark',
      'schema.class/Organization',
      'schema.class/Event',
      'schema.class/BusinessMeeting',
    ])
  })

  test('off-ancestor-is-marked-kept-as-parent', () => {
    const vm = vmFor(
      role({
        classOverrides: { 'schema.class/Event': 'off', 'schema.class/BusinessMeeting': 'on' },
      })
    )
    expect(section(vm, 'schema.class/Event')).toMatchObject({
      on: false,
      tags: [{ label: 'kept as parent of BusinessMeeting', kind: 'parent' }],
    })
  })

  test('links-to-any-page-shown-before-export', () => {
    const key = `${Person}|schema.property/worksFor`
    const alone = vmFor(
      role({ classOverrides: { [Person]: 'on' }, propertyOverrides: { [key]: 'on' } })
    )
    expect(row(alone, Person, 'schema.property/worksFor').linksToAnyPage).toBe(true)
    const both = vmFor(role({ presets: ['crm'] }))
    expect(row(both, Person, 'schema.property/worksFor').linksToAnyPage).toBe(false)
    expect(row(both, Person, 'schema.property/email').linksToAnyPage).toBe(false)
  })

  test('totals', () => {
    const vm = vmFor(role({ presets: ['crm'] }))
    // Thing (parent, 0/2 on) + Person (2/3) + Organization (3/3)
    expect(vm.totals).toEqual({ classes: 3, propertiesOn: 5, propertiesTotal: 8 })
  })

  test('notices-report-missing', () => {
    const vm = vmFor(role({ presets: ['nope'] }))
    expect(vm.notices).toEqual(['Not in the library: preset:nope'])
  })
})
