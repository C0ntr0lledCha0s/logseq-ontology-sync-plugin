import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { LogseqOntologyAPI } from '../src/api/ontology-api'
import { buildFilterQuery } from '../src/api/queries'
import type { PropertyDefinition, ClassDefinition } from '../src/api/types'

// Mock the logseq global
const mockLogseq = {
  Editor: {
    createPage: mock(async (name: string, properties: Record<string, unknown>) => ({
      id: Date.now(),
      uuid: crypto.randomUUID(),
      name,
      originalName: name,
      properties,
    })),
    getPage: mock(async (name: string) => ({
      id: Date.now(),
      uuid: crypto.randomUUID(),
      name,
      originalName: name,
    })),
    deletePage: mock(async () => undefined),
    getPageBlocksTree: mock(async () => [
      { uuid: crypto.randomUUID(), content: '' },
    ]),
    upsertBlockProperty: mock(async () => undefined),
  },
  DB: {
    datascriptQuery: mock(async () => []),
  },
}

// Set global logseq
;(globalThis as Record<string, unknown>).logseq = mockLogseq

describe('LogseqOntologyAPI', () => {
  let api: LogseqOntologyAPI

  beforeEach(() => {
    api = new LogseqOntologyAPI()
    // Reset mocks before each test
    mockLogseq.Editor.createPage.mockClear()
    mockLogseq.Editor.getPage.mockClear()
    mockLogseq.Editor.deletePage.mockClear()
    mockLogseq.Editor.getPageBlocksTree.mockClear()
    mockLogseq.Editor.upsertBlockProperty.mockClear()
    mockLogseq.DB.datascriptQuery.mockClear()
  })

  describe('Property Operations', () => {
    test('should create a property', async () => {
      const def: PropertyDefinition = {
        name: 'test-property',
        type: 'default',
        cardinality: 'one',
      }

      const result = await api.createProperty(def)

      expect(result).toBeDefined()
      expect(result.name).toBe('test-property')
      expect(result.uuid).toBeDefined()
    })

    test('should update a property', async () => {
      // Should not throw
      await expect(api.updateProperty('test-id', { title: 'Updated' })).resolves.toBeUndefined()
    })

    test('should delete a property', async () => {
      await expect(api.deleteProperty('test-id')).resolves.toBeUndefined()
    })

    test('should get existing properties', async () => {
      const properties = await api.getExistingProperties()

      expect(properties).toBeInstanceOf(Map)
    })
  })

  describe('Class Operations', () => {
    test('should create a class', async () => {
      const def: ClassDefinition = {
        name: 'TestClass',
      }

      const result = await api.createClass(def)

      expect(result).toBeDefined()
      expect(result.name).toBe('TestClass')
      expect(result.uuid).toBeDefined()
    })

    test('should update a class', async () => {
      await expect(api.updateClass('test-id', { title: 'Updated' })).resolves.toBeUndefined()
    })

    test('should delete a class', async () => {
      await expect(api.deleteClass('test-id')).resolves.toBeUndefined()
    })

    test('should get existing classes', async () => {
      const classes = await api.getExistingClasses()

      expect(classes).toBeInstanceOf(Map)
    })
  })

  describe('Transaction Operations', () => {
    test('should begin a transaction', async () => {
      const tx = await api.beginTransaction()

      expect(tx).toBeDefined()
      expect(tx.id).toBeDefined()
      expect(tx.status).toBe('pending')
    })

    test('should not allow multiple transactions', async () => {
      await api.beginTransaction()

      await expect(api.beginTransaction()).rejects.toThrow('already in progress')
    })

    test('should add operations to transaction', async () => {
      await api.beginTransaction()

      expect(() =>
        api.addToTransaction({
          type: 'createProperty',
          data: { name: 'test', type: 'default', cardinality: 'one' },
        })
      ).not.toThrow()
    })

    test('should commit transaction', async () => {
      await api.beginTransaction()
      api.addToTransaction({
        type: 'createProperty',
        data: { name: 'test', type: 'default', cardinality: 'one' },
      })

      await expect(api.commitTransaction()).resolves.toBeUndefined()
    })

    test('should rollback transaction', async () => {
      await api.beginTransaction()

      await expect(api.rollbackTransaction()).resolves.toBeUndefined()
    })

    test('should throw when no transaction exists', async () => {
      await expect(api.commitTransaction()).rejects.toThrow('No transaction')
    })
  })

  describe('Batch Operations', () => {
    test('should execute batch operations', async () => {
      const items = [1, 2, 3]
      const operation = async () => {}

      const result = await api.executeBatch(items, operation)

      expect(result.total).toBe(3)
      expect(result.succeeded).toBe(3)
      expect(result.failed).toBe(0)
    })

    test('should track batch progress', async () => {
      const items = [1, 2, 3]
      const progressUpdates: number[] = []

      await api.executeBatch(items, async () => {}, (progress) => {
        progressUpdates.push(progress.current)
      })

      expect(progressUpdates).toEqual([1, 2, 3])
    })

    test('should handle batch errors', async () => {
      const items = [1, 2, 3]
      const operation = async (item: number) => {
        if (item === 2) throw new Error('Test error')
      }

      const result = await api.executeBatch(items, operation)

      expect(result.succeeded).toBe(2)
      expect(result.failed).toBe(1)
      expect(result.errors).toHaveLength(1)
    })
  })
})

describe('Query Helpers', () => {
  test('should build filter query for properties', () => {
    const query = buildFilterQuery('property', { name: 'test' })

    expect(query).toContain(':block/type "property"')
    expect(query).toContain(':block/name "test"')
  })

  test('should build filter query for classes', () => {
    const query = buildFilterQuery('class', {})

    expect(query).toContain(':block/type "class"')
  })

  test('should ignore undefined filters', () => {
    const query = buildFilterQuery('property', { name: 'test', other: undefined })

    expect(query).toContain(':block/name "test"')
    expect(query).not.toContain('other')
  })
})
