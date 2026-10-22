import { describe, expect, test } from 'bun:test'
import { firstAvailable, matchClasses, type ClassOption } from '../src/ui/builder/class-match'

const opt = (title: string, parentTitle: string | null = null): ClassOption => ({
  ident: `:schema.class/${title}`,
  title,
  parentTitle,
})
const classes = [
  opt('Organization'),
  opt('Person'),
  opt('LocalBusiness', 'Organization'),
  opt('Place'),
  opt('Corporation', 'Organization'),
]
const titles = (q: string, sel = new Set<string>()): string[] =>
  matchClasses(classes, q, sel).map((m) => m.title)

describe('matchClasses', () => {
  test('empty query returns all, alphabetical', () => {
    expect(titles('')).toEqual(['Corporation', 'LocalBusiness', 'Organization', 'Person', 'Place'])
    expect(titles('   ')).toHaveLength(5)
  })
  test('prefix matches come before substring matches', () => {
    expect(titles('or')).toEqual(['Organization', 'Corporation'])
    expect(titles('p')).toEqual(['Person', 'Place', 'Corporation'])
  })
  test('is case-insensitive', () => {
    expect(titles('PERS')).toEqual(['Person'])
    expect(titles('local')).toEqual(['LocalBusiness'])
  })
  test('no match gives empty list', () => {
    expect(titles('zzz')).toEqual([])
  })
  test('marks already-selected classes and keeps parent title', () => {
    const out = matchClasses(classes, 'local', new Set([':schema.class/LocalBusiness']))
    expect(out).toEqual([{ ...opt('LocalBusiness', 'Organization'), selected: true }])
    expect(matchClasses(classes, 'person', new Set()).every((m) => !m.selected)).toBe(true)
  })
})

describe('firstAvailable', () => {
  test('skips selected classes', () => {
    const sel = new Set([':schema.class/Person'])
    expect(firstAvailable(matchClasses(classes, 'p', sel))?.title).toBe('Place')
  })
  test('undefined when all matches are selected or none match', () => {
    const sel = new Set([':schema.class/Person'])
    expect(firstAvailable(matchClasses(classes, 'person', sel))).toBeUndefined()
    expect(firstAvailable(matchClasses(classes, 'zzz', sel))).toBeUndefined()
  })
})
