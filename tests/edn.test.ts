import { describe, expect, test } from 'bun:test'
import { readEdn } from '../src/edn/read'
import { writeEdn } from '../src/edn/write'
import { kw, mapGet, type EdnMap } from '../src/edn/value'

const ENTRY =
  '{:schema.property/spouse {:db/cardinality :db.cardinality/one :logseq.property/type :node :block/title "spouse" :build/property-classes [:schema.class/Person] :build/properties {:logseq.property/icon {:id "people_hugging" :type :emoji} :logseq.property/description "A \\"quoted\\"\\nline"}}}'

describe('edn', () => {
  test('round-trips-library-entry', () => {
    const a = readEdn(ENTRY)
    const b = readEdn(writeEdn(a))
    expect(b).toEqual(a)
    expect(writeEdn(b)).toBe(writeEdn(a))
    const spouse = mapGet(a as EdnMap, 'schema.property/spouse') as EdnMap
    expect(mapGet(spouse, 'block/title')).toBe('spouse')
    expect(mapGet(spouse, 'db/cardinality')).toBe(kw('db.cardinality/one'))
  })

  test('writes-uuid-tag', () => {
    expect(writeEdn({ uuid: '67cfe8f6-6242-4a22-b196-8f6b95e96d8a' })).toBe(
      '#uuid "67cfe8f6-6242-4a22-b196-8f6b95e96d8a"'
    )
    expect(readEdn('#uuid "67cfe8f6-6242-4a22-b196-8f6b95e96d8a"')).toEqual({
      uuid: '67cfe8f6-6242-4a22-b196-8f6b95e96d8a',
    })
  })

  test('keyword-interning', () => {
    expect(kw('a')).toBe(kw('a'))
  })

  test('rejects-unknown-tag', () => {
    expect(() => readEdn('#inst "2020-01-01"')).toThrow('Unsupported EDN tag')
    expect(() => readEdn('#foo 1')).toThrow('Unsupported EDN tag: foo')
  })

  test('reads-namespace-map-literal-or-throws', () => {
    // edn-data surfaces #:a{...} as a tag named ":a", which we reject clearly.
    expect(() => readEdn('#:a{:b 1}')).toThrow('Unsupported EDN tag')
  })

  test('writes-scalars-and-lists', () => {
    expect(writeEdn(readEdn('(1 nil true "x")'))).toBe('[1 nil true "x"]')
    expect(writeEdn(new Map([[kw('a'), [kw('b/c'), 2]]]))).toBe('{:a [:b/c 2]}')
  })
})
