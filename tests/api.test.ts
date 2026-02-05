import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { LogseqOntologyAPI, OntologyAPIError } from '../src/api/ontology-api'
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
  // Common keys - use namespaced key for system description field
  // Discovery (Feb 2025): ':logseq.property/description' sets the SYSTEM description
  description: ':logseq.property/description',
  title: 'title',
  icon: 'icon',
  schemaVersion: 'schema-version',
}

// Track DB mode API calls
interface UpsertPropertyCall {
  name: string
  options: Record<string, unknown>
}

interface CreateTagCall {
  name: string
  opts?: { uuid?: string }
}

interface AddTagPropertyCall {
  tagId: string | number
  propertyIdOrName: string | number
}

interface AddTagExtendsCall {
  tagId: string | number
  parentTagIdOrName: string | number
}

const upsertPropertyCalls: UpsertPropertyCall[] = []
const createTagCalls: CreateTagCall[] = []
const addTagPropertyCalls: AddTagPropertyCall[] = []
const addTagExtendsCalls: AddTagExtendsCall[] = []

// Track if getTag should return null (for testing duplicate detection)
let getTagReturnsNull = true

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
    // DB mode APIs
    upsertProperty: mock(async (name: string, options: Record<string, unknown>) => {
      upsertPropertyCalls.push({ name, options })
      return {
        id: Date.now(),
        uuid: crypto.randomUUID(),
      }
    }),
    // Tag management APIs
    createTag: mock(async (name: string, opts?: { uuid?: string }) => {
      createTagCalls.push({ name, opts })
      return {
        id: Date.now(),
        uuid: crypto.randomUUID(),
        name,
        originalName: name,
      }
    }),
    getTag: mock(async () => {
      if (getTagReturnsNull) {
        return null
      }
      return {
        id: Date.now(),
        uuid: crypto.randomUUID(),
      }
    }),
    addTagProperty: mock(async (tagId: string | number, propertyIdOrName: string | number) => {
      addTagPropertyCalls.push({ tagId, propertyIdOrName })
      return undefined
    }),
    addTagExtends: mock(async (tagId: string | number, parentTagIdOrName: string | number) => {
      addTagExtendsCalls.push({ tagId, parentTagIdOrName })
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
    mockLogseq.Editor.upsertProperty.mockClear()
    mockLogseq.Editor.createTag.mockClear()
    mockLogseq.Editor.getTag.mockClear()
    mockLogseq.Editor.addTagProperty.mockClear()
    mockLogseq.Editor.addTagExtends.mockClear()
    mockLogseq.DB.datascriptQuery.mockClear()
    // Reset state
    getPageReturnsNull = false
    getTagReturnsNull = true // Default: tags don't exist (for creation tests)
    getPageBlocksTreeReturnsEmpty = false
    getPageBlocksTreeReturnsInvalid = false
    // Clear tracking arrays
    createPageCalls.length = 0
    upsertBlockPropertyCalls.length = 0
    upsertPropertyCalls.length = 0
    createTagCalls.length = 0
    addTagPropertyCalls.length = 0
    addTagExtendsCalls.length = 0
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

    test('should upsert property without throwing on duplicate (DB mode behavior)', async () => {
      // In DB mode, upsertProperty handles duplicates by updating
      // It doesn't throw an error for existing properties

      const def: PropertyDefinition = {
        name: 'existing-property',
        type: 'default',
        cardinality: 'one',
      }

      // Should not throw - upsertProperty handles duplicates gracefully
      const result = await api.createProperty(def)
      expect(result).toBeDefined()
      expect(result.name).toBe('existing-property')
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

    test('should pass correct property options to upsertProperty API', async () => {
      const def: PropertyDefinition = {
        name: 'test-property',
        type: 'number',
        cardinality: 'many',
        description: 'A test property',
        hide: true,
        classes: ['Person', 'Organization'],
      }

      await api.createProperty(def)

      // For DB mode, we use upsertProperty instead of createPage
      expect(upsertPropertyCalls).toHaveLength(1)
      const call = upsertPropertyCalls[0]!

      // Verify property options match Logseq DB mode API expectations
      expect(call.name).toBe('test-property')
      expect(call.options.type).toBe('number')
      expect(call.options.cardinality).toBe('many')
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
    test('should create a class using createTag API', async () => {
      // Class/tag doesn't exist yet
      getPageReturnsNull = true
      getTagReturnsNull = true

      const def: ClassDefinition = {
        name: 'TestClass',
      }

      const result = await api.createClass(def)

      expect(result).toBeDefined()
      expect(result.name).toBe('TestClass')
      expect(result.uuid).toBeDefined()
      // Verify createTag was called
      expect(createTagCalls).toHaveLength(1)
      expect(createTagCalls[0]!.name).toBe('TestClass')
    })

    test('should throw on duplicate class', async () => {
      // Page already exists (duplicate detection via getPage)
      getPageReturnsNull = false
      getTagReturnsNull = true

      const def: ClassDefinition = {
        name: 'ExistingClass',
      }

      // Should throw because getPage returns a page (duplicate detected)
      await expect(api.createClass(def)).rejects.toThrow(OntologyAPIError)
      await expect(api.createClass(def)).rejects.toThrow('Class already exists: ExistingClass')
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

    test('should call createTag, addTagProperty, and addTagExtends for class with properties and parent', async () => {
      // Class doesn't exist yet
      getPageReturnsNull = true
      getTagReturnsNull = true

      const def: ClassDefinition = {
        name: 'TestClass',
        parent: 'ParentClass',
        description: 'A test class',
        properties: ['prop1', 'prop2'],
        icon: '📦',
      }

      await api.createClass(def)

      // createTag is called
      expect(createTagCalls).toHaveLength(1)
      expect(createTagCalls[0]!.name).toBe('TestClass')

      // addTagProperty is called for each property
      expect(addTagPropertyCalls).toHaveLength(2)
      expect(addTagPropertyCalls[0]!.propertyIdOrName).toBe('prop1')
      expect(addTagPropertyCalls[1]!.propertyIdOrName).toBe('prop2')

      // addTagExtends is called for parent
      expect(addTagExtendsCalls).toHaveLength(1)
      expect(addTagExtendsCalls[0]!.parentTagIdOrName).toBe('ParentClass')
    })

    test('should normalize property names to lowercase when adding to tag', async () => {
      // Class doesn't exist yet
      getPageReturnsNull = true
      getTagReturnsNull = true

      const def: ClassDefinition = {
        name: 'TestClass',
        properties: ['FirstName', 'Last Name', 'EMAIL'],
      }

      await api.createClass(def)

      // Properties should be normalized: lowercase, spaces replaced with hyphens
      expect(addTagPropertyCalls).toHaveLength(3)
      expect(addTagPropertyCalls[0]!.propertyIdOrName).toBe('firstname')
      expect(addTagPropertyCalls[1]!.propertyIdOrName).toBe('last-name')
      expect(addTagPropertyCalls[2]!.propertyIdOrName).toBe('email')
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
      // Properties are normalized to lowercase to match Logseq's internal format
      expect(propertiesCall?.value).toEqual(['newprop'])
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

describe('OntologyAPIError', () => {
  describe('isDuplicate', () => {
    test('should return true for DUPLICATE_PROPERTY code', () => {
      const error = new OntologyAPIError('Property exists', 'DUPLICATE_PROPERTY')
      expect(error.isDuplicate()).toBe(true)
    })

    test('should return true for DUPLICATE_CLASS code', () => {
      const error = new OntologyAPIError('Class exists', 'DUPLICATE_CLASS')
      expect(error.isDuplicate()).toBe(true)
    })

    test('should return true for PLUGIN_OWNERSHIP_RESTRICTED code', () => {
      const error = new OntologyAPIError('Cannot modify', 'PLUGIN_OWNERSHIP_RESTRICTED')
      expect(error.isDuplicate()).toBe(true)
    })

    test('should return false for other error codes', () => {
      const error = new OntologyAPIError('Failed', 'CREATE_PROPERTY_FAILED')
      expect(error.isDuplicate()).toBe(false)
    })

    test('should return false for validation errors', () => {
      const error = new OntologyAPIError('Invalid', 'INVALID_PROPERTY')
      expect(error.isDuplicate()).toBe(false)
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
