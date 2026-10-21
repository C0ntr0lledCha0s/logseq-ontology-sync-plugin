import { describe, expect, test } from 'bun:test'
import { roleFromFile, roleToFile } from '../src/role/role-file'
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
    expect(parsed.format).toBe('ontology-role')
    expect(parsed.version).toBe(1)
    expect(parsed.role.lastExport).toBeUndefined()
    expect(text).toContain('\n  "format"')
    const { lastExport: _omit, ...expected } = role
    expect(roleFromFile(text)).toEqual(expected)
  })

  test('rejects-bad-role-file', () => {
    const good = JSON.parse(roleToFile(role))
    const bad = [
      'not json',
      JSON.stringify({ ...good, format: 'other' }),
      JSON.stringify({ ...good, version: 2 }),
      JSON.stringify({ ...good, role: { name: 'x' } }),
      JSON.stringify({ ...good, role: undefined }),
    ]
    for (const text of bad) {
      expect(() => roleFromFile(text)).toThrow('Not an ontology role file')
    }
  })
})
