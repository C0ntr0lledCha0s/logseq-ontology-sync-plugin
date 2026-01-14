import { describe, test, expect } from 'bun:test'
import { parseEdn, encodeEdn, validateEdnTemplate } from '../src/parser/edn-parser'

describe('EDN Parser', () => {
  test('should parse simple EDN string', () => {
    const ednString = '{:name "Test" :value 42}'
    const result = parseEdn(ednString)

    expect(result).toBeDefined()
    expect(typeof result).toBe('object')
  })

  test('should encode object to EDN', () => {
    const data = { name: 'Test', value: 42 }
    const result = encodeEdn(data)

    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
  })

  test('should validate EDN template structure', () => {
    const validData = { pages: [], blocks: [] }
    expect(validateEdnTemplate(validData)).toBe(true)

    const invalidData = null
    expect(validateEdnTemplate(invalidData as never)).toBe(false)
  })

  test('should throw error for invalid EDN', () => {
    expect(() => parseEdn('invalid edn {')).toThrow()
  })
})
