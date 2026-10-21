import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { ancestors, parseLibrary, parsePresets } from '../src/library/parse'

const read = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const lib = parseLibrary(read('library.edn'))

describe('library', () => {
  test('parses-classes-and-parents', () => {
    expect(lib.classes.size).toBe(5)
    const person = lib.classes.get('schema.class/Person')
    expect(person?.title).toBe('Person')
    expect(person?.parents).toEqual(['schema.class/Thing'])
    expect(person?.properties).toEqual([
      'schema.property/email',
      'schema.property/spouse',
      'schema.property/worksFor',
    ])
    expect(lib.classes.get('schema.class/Thing')?.parents).toEqual([])
  })

  test('parses-property-schema', () => {
    const spouse = lib.properties.get('schema.property/spouse')
    expect(spouse?.type).toBe('node')
    expect(spouse?.cardinality).toBe('one')
    expect(spouse?.targetClasses).toEqual(['schema.class/Person'])
    expect(lib.properties.get('schema.property/email')?.cardinality).toBe('many')
    expect(lib.properties.get('schema.property/url')?.targetClasses).toEqual([])
    expect(lib.properties.get('schema.property/url')?.raw).toBeInstanceOf(Map)
  })

  test('ancestors-of-business-meeting', () => {
    expect(ancestors(lib, 'schema.class/BusinessMeeting')).toEqual([
      'schema.class/Event',
      'schema.class/Thing',
    ])
  })

  test('ancestors-cycle-safe-and-deduplicated', () => {
    const cyc = parseLibrary(
      '{:schema-library/version "1" :properties {} :classes {:a/A {:block/title "A" :build/class-extends [:a/B :a/C]} :a/B {:block/title "B" :build/class-extends [:a/D]} :a/C {:block/title "C" :build/class-extends [:a/D]} :a/D {:block/title "D" :build/class-extends [:a/A]}}}',
    )
    expect(ancestors(cyc, 'a/A')).toEqual(['a/B', 'a/C', 'a/D'])
  })

  test('parses-presets', () => {
    const { version, presets } = parsePresets(read('presets.edn'))
    expect(version).toBe('2.0.0')
    expect(presets.map((p) => p.id)).toEqual(['crm', 'events'])
    const crm = presets[0]
    expect(crm.name).toBe('CRM')
    expect(crm.classes.get('schema.class/Person')).toEqual([
      'schema.property/email',
      'schema.property/worksFor',
    ])
    expect(crm.classes.get('schema.class/Organization')).toContain('custom.property/areas')
  })

  test('version-read', () => {
    expect(lib.version).toBe('2.0.0')
  })

  test('missing-version-throws', () => {
    expect(() => parseLibrary('{:properties {} :classes {}}')).toThrow(/version/)
    expect(() => parsePresets('{:presets []}')).toThrow(/version/)
  })

  test('malformed-entries-throw-naming-ident', () => {
    expect(() =>
      parseLibrary(
        '{:schema-library/version "1" :classes {} :properties {:x/p {:block/title "p" :logseq.property/type :default}}}',
      ),
    ).toThrow(/x\/p/)
    expect(() =>
      parseLibrary(
        '{:schema-library/version "1" :classes {} :properties {:x/p {:block/title "p" :db/cardinality :db.cardinality/one}}}',
      ),
    ).toThrow(/x\/p/)
    expect(() =>
      parseLibrary('{:schema-library/version "1" :properties {} :classes {:x/C {}}}'),
    ).toThrow(/x\/C/)
  })
})
