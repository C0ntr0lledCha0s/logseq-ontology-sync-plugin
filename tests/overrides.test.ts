import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { parseLibrary, parsePresets } from '../src/library/parse'
import { setClass, setProperty, togglePreset } from '../src/ui/builder/overrides'
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
const Person = 'schema.class/Person'
const email = 'schema.property/email'
const spouse = 'schema.property/spouse'

describe('overrides', () => {
  test('preset-toggle', () => {
    expect(togglePreset(role(), 'crm').presets).toEqual(['crm'])
    expect(togglePreset(role({ presets: ['crm'] }), 'crm').presets).toEqual([])
  })

  test('property-off-then-on-removes-override', () => {
    const off = setProperty(lib, presets, role({ presets: ['crm'] }), Person, email, false)
    expect(off.propertyOverrides).toEqual({ [`${Person}|${email}`]: 'off' })
    const back = setProperty(lib, presets, off, Person, email, true)
    expect(back.propertyOverrides).toEqual({})
    expect(back.classOverrides).toEqual({})
  })

  test('switching-on-adds-class-override', () => {
    const r = setProperty(lib, presets, role({ presets: ['crm'] }), Person, spouse, true)
    expect(r.propertyOverrides).toEqual({ [`${Person}|${spouse}`]: 'on' })
    expect(r.classOverrides).toEqual({ [Person]: 'on' })
  })

  test('class-override-kept-while-user-on-property-exists', () => {
    let r = setProperty(lib, presets, role({ presets: ['crm'] }), Person, spouse, true)
    r = setClass(lib, presets, r, Person, true)
    expect(r.classOverrides[Person]).toBe('on')
    r = setProperty(lib, presets, r, Person, spouse, false)
    expect(r.propertyOverrides).toEqual({})
    expect(r.classOverrides).toEqual({})
  })

  test('class-toggle-matching-default-removes-override', () => {
    const off = setClass(lib, presets, role({ presets: ['crm'] }), Person, false)
    expect(off.classOverrides).toEqual({ [Person]: 'off' })
    expect(setClass(lib, presets, off, Person, true).classOverrides).toEqual({})
    const added = setClass(lib, presets, role(), Person, true)
    expect(added.classOverrides).toEqual({ [Person]: 'on' })
  })
})
