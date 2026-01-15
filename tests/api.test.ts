import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { LogseqOntologyAPI } from '../src/api/ontology-api'
import { buildFilterQuery } from '../src/api/queries'
import type { PropertyDefinition, ClassDefinition } from '../src/api/types'

// ============================================================================
// Mock Configuration
// ============================================================================

// Create dynamic mock that can be configured per test
let getPageReturnsNull = false
let getPageBlocksTreeReturnsEmpty = false
let getPageBlocksTreeReturnsInvalid = false

// Track calls to validate API contracts
interface CreatePageCall {
  name: string
  properties: Record<string, unknown>
  options?: { redirect?: boolean }
}

interface UpsertBlockPropertyCall {
  blockUuid: string
  propertyName: string
  value: unknown
}

const createPageCalls: CreatePageCall[] = []
const upsertBlockPropertyCalls: UpsertBlockPropertyCall[] = []

// Expected property names for Logseq API
const EXPECTED_PROPERTY_KEYS = {
  // Property page keys
  propertyType: 'block/type',
  propertySchemaType: 'property/schema-type',
  propertyCardinality: 'property/cardinality',
  propertyHide: 'property/hide?',
  propertyClasses: 'property/classes',
  // Class page keys
  classType: 'block/type',
  classParent: 'class/parent',
  classProperties: 'class/properties',
  // Common keys
  description: 'description',
  title: 'title',
  icon: 'icon',
  schemaVersion: 'schema-version',
}

// Mock the logseq global with enhanced tracking
const mockLogseq = {
  Editor: {
    createPage: mock(async (name: string, properties: Record<string, unknown>, options?: { redirect?: boolean }) => {
      createPageCalls.push({ name, properties, options })
      return {
        id: Date.now(),
        uuid: crypto.randomUUID(),
        name,
        originalName: name,
        properties,
      }
    }),
    getPage: mock(async (name: string) => {
      if (getPageReturnsNull) {
        return null
      }
      return {
        id: Date.now(),
        uuid: crypto.randomUUID(),
        name,
        originalName: name,
      }
    }),
    deletePage: mock(async () => undefined),
    getPageBlocksTree: mock(async () => {
      if (getPageBlocksTreeReturnsEmpty) {
        return []
      }
      if (getPageBlocksTreeReturnsInvalid) {
        return [{ content: 'no uuid here' }]
      }
      return [
        { uuid: crypto.randomUUID(), content: '' },
      ]
    }),
    upsertBlockProperty: mock(async (blockUuid: string, propertyName: string, value: unknown) => {
      upsertBlockPropertyCalls.push({ blockUuid, propertyName, value })
      return undefined
    }),
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
    // Reset state
    getPageReturnsNull = false
    getPageBlocksTreeReturnsEmpty = false
    getPageBlocksTreeReturnsInvalid = false
    // Clear tracking arrays
    createPageCalls.length = 0
    upsertBlockPropertyCalls.length = 0
  })

  describe('Property Operations', () => {
    test('should create a property', async () => {
      // Property doesn't exist yet
      getPageReturnsNull = true

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

    test('should throw when creating duplicate property', async () => {
      // Property already exists
      getPageReturnsNull = false

      const def: PropertyDefinition = {
        name: 'existing-property',
        type: 'default',
        cardinality: 'one',
      }

      await expect(api.createProperty(def)).rejects.toThrow('already exists')
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

    test('should pass correct property keys to Logseq API', async () => {
      getPageReturnsNull = true

      const def: PropertyDefinition = {
        name: 'test-property',
        type: 'number',
        cardinality: 'many',
        description: 'A test property',
        hide: true,
        classes: ['Person', 'Organization'],
      }

      await api.createProperty(def)

      expect(createPageCalls).toHaveLength(1)
      const call = createPageCalls[0]!

      // Verify property keys match Logseq API expectations
      expect(call.properties[EXPECTED_PROPERTY_KEYS.propertyType]).toBe('property')
      expect(call.properties[EXPECTED_PROPERTY_KEYS.propertySchemaType]).toBe('number')
      expect(call.properties[EXPECTED_PROPERTY_KEYS.propertyCardinality]).toBe('many')
      expect(call.properties[EXPECTED_PROPERTY_KEYS.description]).toBe('A test property')
      expect(call.properties[EXPECTED_PROPERTY_KEYS.propertyHide]).toBe(true)
      expect(call.properties[EXPECTED_PROPERTY_KEYS.propertyClasses]).toEqual(['Person', 'Organization'])
    })

    test('should throw when updating property with no valid blocks', async () => {
      getPageBlocksTreeReturnsEmpty = true

      await expect(api.updateProperty('test-property', { title: 'Updated' }))
        .rejects.toThrow('no valid blocks')
    })

    test('should throw when updating property with invalid block structure', async () => {
      getPageBlocksTreeReturnsInvalid = true

      await expect(api.updateProperty('test-property', { title: 'Updated' }))
        .rejects.toThrow('no valid blocks')
    })

    test('should pass correct keys when updating property', async () => {
      await api.updateProperty('test-property', {
        type: 'date',
        cardinality: 'one',
        description: 'Updated description',
      })

      // Verify upsert calls use correct property names
      const typeCall = upsertBlockPropertyCalls.find(c => c.propertyName === EXPECTED_PROPERTY_KEYS.propertySchemaType)
      const cardinalityCall = upsertBlockPropertyCalls.find(c => c.propertyName === EXPECTED_PROPERTY_KEYS.propertyCardinality)
      const descriptionCall = upsertBlockPropertyCalls.find(c => c.propertyName === EXPECTED_PROPERTY_KEYS.description)

      expect(typeCall?.value).toBe('date')
      expect(cardinalityCall?.value).toBe('one')
      expect(descriptionCall?.value).toBe('Updated description')
    })
  })

  describe('Class Operations', () => {
    test('should create a class', async () => {
      // Class doesn't exist yet
      getPageReturnsNull = true

      const def: ClassDefinition = {
        name: 'TestClass',
      }

      const result = await api.createClass(def)

      expect(result).toBeDefined()
      expect(result.name).toBe('TestClass')
      expect(result.uuid).toBeDefined()
    })

    test('should throw when creating duplicate class', async () => {
      // Class already exists
      getPageReturnsNull = false

      const def: ClassDefinition = {
        name: 'ExistingClass',
      }

      await expect(api.createClass(def)).rejects.toThrow('already exists')
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

    test('should pass correct class keys to Logseq API', async () => {
      getPageReturnsNull = true

      const def: ClassDefinition = {
        name: 'TestClass',
        parent: 'ParentClass',
        description: 'A test class',
        properties: ['prop1', 'prop2'],
        icon: '📦',
      }

      await api.createClass(def)

      expect(createPageCalls).toHaveLength(1)
      const call = createPageCalls[0]!

      // Verify class keys match Logseq API expectations
      expect(call.properties[EXPECTED_PROPERTY_KEYS.classType]).toBe('class')
      expect(call.properties[EXPECTED_PROPERTY_KEYS.classParent]).toBe('ParentClass')
      expect(call.properties[EXPECTED_PROPERTY_KEYS.description]).toBe('A test class')
      expect(call.properties[EXPECTED_PROPERTY_KEYS.classProperties]).toEqual(['prop1', 'prop2'])
      expect(call.properties[EXPECTED_PROPERTY_KEYS.icon]).toBe('📦')
    })

    test('should throw when updating class with no valid blocks', async () => {
      getPageBlocksTreeReturnsEmpty = true

      await expect(api.updateClass('TestClass', { title: 'Updated' }))
        .rejects.toThrow('no valid blocks')
    })

    test('should pass correct keys when updating class', async () => {
      await api.updateClass('TestClass', {
        parent: 'NewParent',
        description: 'Updated description',
        properties: ['newProp'],
      })

      // Verify upsert calls use correct property names
      const parentCall = upsertBlockPropertyCalls.find(c => c.propertyName === EXPECTED_PROPERTY_KEYS.classParent)
      const descriptionCall = upsertBlockPropertyCalls.find(c => c.propertyName === EXPECTED_PROPERTY_KEYS.description)
      const propertiesCall = upsertBlockPropertyCalls.find(c => c.propertyName === EXPECTED_PROPERTY_KEYS.classProperties)

      expect(parentCall?.value).toBe('NewParent')
      expect(descriptionCall?.value).toBe('Updated description')
      expect(propertiesCall?.value).toEqual(['newProp'])
    })

    test('should throw when class is its own parent', async () => {
      getPageReturnsNull = true

      const def: ClassDefinition = {
        name: 'SelfReference',
        parent: 'SelfReference',
      }

      await expect(api.createClass(def)).rejects.toThrow('cannot be its own parent')
    })

    test('should throw when class properties is not an array', async () => {
      getPageReturnsNull = true

      const def = {
        name: 'BadClass',
        properties: 'not-an-array' as unknown as string[],
      }

      await expect(api.createClass(def)).rejects.toThrow('must be an array')
    })
  })

  describe('Batch Operations (new API)', () => {
    test('should begin and execute batch', async () => {
      // Items don't exist
      getPageReturnsNull = true

      api.beginBatch()
      api.addToBatch({
        type: 'createProperty',
        name: 'batch-prop',
        data: { name: 'batch-prop', type: 'default', cardinality: 'one' },
      })

      const result = await api.executeBatch()

      expect(result.total).toBe(1)
      expect(result.succeeded).toBe(1)
      expect(result.failed).toBe(0)
    })

    test('should not allow multiple batches', () => {
      api.beginBatch()

      expect(() => api.beginBatch()).toThrow('already in progress')
    })

    test('should cancel batch', () => {
      api.beginBatch()

      expect(() => api.cancelBatch()).not.toThrow()
    })

    test('should throw when no batch exists', async () => {
      await expect(api.executeBatch()).rejects.toThrow('No batch')
    })

    test('should get batch status', () => {
      api.beginBatch()

      const status = api.getBatchStatus()

      expect(status).toBeDefined()
      expect(status!.status).toBe('pending')
    })
  })

  describe('Transaction Operations (deprecated API)', () => {
    test('should begin a transaction (deprecated)', async () => {
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
      // Items don't exist
      getPageReturnsNull = true

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
      await expect(api.commitTransaction()).rejects.toThrow('No batch')
    })
  })

  describe('Generic Batch Executor (runBatch)', () => {
    test('should execute batch operations', async () => {
      const items = [1, 2, 3]
      const operation = async () => {}

      const result = await api.runBatch(items, operation)

      expect(result.total).toBe(3)
      expect(result.succeeded).toBe(3)
      expect(result.failed).toBe(0)
    })

    test('should track batch progress', async () => {
      const items = [1, 2, 3]
      const progressUpdates: number[] = []

      await api.runBatch(items, async () => {}, (progress) => {
        progressUpdates.push(progress.current)
      })

      expect(progressUpdates).toEqual([1, 2, 3])
    })

    test('should handle batch errors', async () => {
      const items = [1, 2, 3]
      const operation = async (item: number) => {
        if (item === 2) throw new Error('Test error')
      }

      const result = await api.runBatch(items, operation)

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
