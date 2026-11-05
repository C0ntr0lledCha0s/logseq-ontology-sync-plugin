import { describe, expect, test } from 'bun:test'
import { roleFromFile, roleNameError, roleToFile } from '../src/role/role-file'
import type { StoredRole } from '../src/logseq/role-store'

const role: StoredRole = {
  name: 'Analyst',
  libraryVersion: '2.0.0',
  presets: ['p1'],
  classOverrides: { 'schema.class/Person': 'on' },
  propertyOverrides: { 'a|b': 'off' },
  lastExport: {
    properties: {},
    classProperties: {},
    exportedAt: '2026-01-01T00:00:00Z',
  },
}

describe('role files', () => {
  test('role-file-round-trip', () => {
    const text = roleToFile(role)
    const parsed = JSON.parse(text)
    expect(parsed.format).toBe('ontology-schema')
    expect(parsed.version).toBe(1)
    expect(parsed.schema.lastExport).toBeUndefined()
    expect(text).toContain('\n  "format"')
    const { lastExport: _omit, ...expected } = role
    expect(roleFromFile(text)).toEqual(expected)
  })

  test('imports files exported as roles by earlier versions', () => {
    const { lastExport: _omit, ...definition } = role
    const legacy = JSON.stringify({ format: 'ontology-role', version: 1, role: definition })
    expect(roleFromFile(legacy)).toEqual(definition)
  })

  test('rejects-bad-role-file', () => {
    const good = JSON.parse(roleToFile(role))
    const bad = [
      'not json',
      JSON.stringify({ ...good, format: 'other' }),
      JSON.stringify({ ...good, version: 2 }),
      JSON.stringify({ ...good, schema: { name: 'x' } }),
      JSON.stringify({ ...good, schema: undefined }),
    ]
    for (const text of bad) {
      expect(() => roleFromFile(text)).toThrow('Not an ontology schema file')
    }
  })
})

describe('role names', () => {
  test('roleNameError', () => {
    expect(roleNameError('Analyst')).toBeNull()
    expect(roleNameError('  ')).not.toBeNull()
    expect(roleNameError('__new__')).not.toBeNull()
    for (const bad of ['a#b', 'a[[b', 'a]]b']) expect(roleNameError(bad)).not.toBeNull()
    expect(roleNameError('a [b] c')).toBeNull()
  })

  test('roleFromFile-rejects-bad-names', () => {
    const good = JSON.parse(roleToFile(role))
    for (const name of ['', '__new__', 'x#y', '[[x]]']) {
      const text = JSON.stringify({ ...good, schema: { ...good.schema, name } })
      expect(() => roleFromFile(text)).toThrow('Not an ontology schema file: ')
    }
  })
})
