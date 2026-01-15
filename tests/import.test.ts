import { describe, test, expect, mock } from 'bun:test'
import { OntologyImporter, diffTemplate, createEmptyOntology } from '../src/import'
import type { ParsedTemplate, ExistingOntology } from '../src/import'

describe('Import Module', () => {
  describe('diffTemplate', () => {
    test('should identify new classes', () => {
      const template: ParsedTemplate = {
        classes: [{ name: 'Person', type: 'default' }],
        properties: [],
      }
      const existing = createEmptyOntology()

      const result = diffTemplate(template, existing)

      expect(result.newClasses).toHaveLength(1)
      expect(result.newClasses[0]?.name).toBe('Person')
      expect(result.updatedClasses).toHaveLength(0)
    })

    test('should identify new properties', () => {
      const template: ParsedTemplate = {
        classes: [],
        properties: [{ name: 'email', type: 'default' }],
      }
      const existing = createEmptyOntology()

      const result = diffTemplate(template, existing)

      expect(result.newProperties).toHaveLength(1)
      expect(result.newProperties[0]?.name).toBe('email')
    })

    test('should identify updated classes', () => {
      const template: ParsedTemplate = {
        classes: [{ name: 'Person', description: 'Updated description' }],
        properties: [],
      }
      const existing: ExistingOntology = {
        classes: new Map([['Person', { name: 'Person', description: 'Original' }]]),
        properties: new Map(),
      }

      const result = diffTemplate(template, existing)

      expect(result.newClasses).toHaveLength(0)
      expect(result.updatedClasses).toHaveLength(1)
      expect(result.updatedClasses[0]?.changes).toContain('description')
    })

    test('should detect conflicts on critical fields', () => {
      const template: ParsedTemplate = {
        classes: [],
        properties: [{ name: 'status', type: 'checkbox' }],
      }
      const existing: ExistingOntology = {
        classes: new Map(),
        properties: new Map([['status', { name: 'status', type: 'default' }]]),
      }

      const result = diffTemplate(template, existing)

      expect(result.conflicts).toHaveLength(1)
      expect(result.conflicts[0]?.name).toBe('status')
      expect(result.conflicts[0]?.reason).toContain('type')
    })

    test('should calculate summary correctly', () => {
      const template: ParsedTemplate = {
        classes: [
          { name: 'NewClass' },
          { name: 'ExistingClass', description: 'updated' },
        ],
        properties: [{ name: 'newProp', type: 'default' }],
      }
      const existing: ExistingOntology = {
        classes: new Map([['ExistingClass', { name: 'ExistingClass' }]]),
        properties: new Map(),
      }

      const result = diffTemplate(template, existing)

      expect(result.summary.totalNew).toBe(2) // 1 class + 1 property
      expect(result.summary.totalUpdated).toBe(1)
    })

    test('should match classes case-insensitively', () => {
      const template: ParsedTemplate = {
        classes: [{ name: 'PERSON', description: 'Updated' }],
        properties: [],
      }
      const existing: ExistingOntology = {
        classes: new Map([['person', { name: 'person', description: 'Original' }]]),
        properties: new Map(),
      }

      const result = diffTemplate(template, existing)

      // Should find as update, not new (case-insensitive match)
      expect(result.newClasses).toHaveLength(0)
      expect(result.updatedClasses).toHaveLength(1)
      expect(result.updatedClasses[0]?.name).toBe('PERSON')
    })

    test('should match properties case-insensitively', () => {
      const template: ParsedTemplate = {
        classes: [],
        properties: [{ name: 'Email', type: 'default', description: 'Updated' }],
      }
      const existing: ExistingOntology = {
        classes: new Map(),
        properties: new Map([['email', { name: 'email', type: 'default' }]]),
      }

      const result = diffTemplate(template, existing)

      // Should find as update (case-insensitive match), not as new
      expect(result.newProperties).toHaveLength(0)
      expect(result.updatedProperties).toHaveLength(1)
      expect(result.updatedProperties[0]?.name).toBe('Email')
    })

    test('should match properties with spaces normalized to hyphens', () => {
      const template: ParsedTemplate = {
        classes: [],
        properties: [{ name: 'First Name', type: 'default', description: 'Updated' }],
      }
      const existing: ExistingOntology = {
        classes: new Map(),
        properties: new Map([['first-name', { name: 'first-name', type: 'default' }]]),
      }

      const result = diffTemplate(template, existing)

      // Should find as update (normalized: "First Name" -> "first-name")
      expect(result.newProperties).toHaveLength(0)
      expect(result.updatedProperties).toHaveLength(1)
    })
  })

  describe('OntologyImporter', () => {
    test('should create importer with default options', () => {
      const importer = new OntologyImporter()
      expect(importer).toBeDefined()
    })

    test('should create importer with custom options', () => {
      const importer = new OntologyImporter({
        dryRun: true,
        conflictStrategy: 'overwrite',
      })
      expect(importer).toBeDefined()
    })

    test('should preview template changes', async () => {
      const importer = new OntologyImporter()
      const content = `{
        :classes [{:name "TestClass"}]
        :properties [{:name "testProp" :type :default}]
      }`

      const preview = await importer.preview(content)

      expect(preview.newClasses).toHaveLength(1)
      expect(preview.newProperties).toHaveLength(1)
    })

    test('should track progress during preview', async () => {
      const progressCalls: string[] = []
      const importer = new OntologyImporter({
        onProgress: (p) => progressCalls.push(p.phase),
      })
      const content = `{:classes [] :properties []}`

      await importer.preview(content)

      expect(progressCalls).toContain('parsing')
      expect(progressCalls).toContain('validating')
      expect(progressCalls).toContain('comparing')
    })

    test('should return dry run result without applying', async () => {
      const importer = new OntologyImporter({ dryRun: true })
      const content = `{:classes [{:name "Test"}] :properties []}`

      const result = await importer.import(content)

      expect(result.success).toBe(true)
      expect(result.dryRun).toBe(true)
      expect(result.applied.classes).toBe(0)
    })

    test('should handle parse errors gracefully', async () => {
      const importer = new OntologyImporter()
      const content = `{:invalid`

      const result = await importer.import(content)

      expect(result.success).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    test('should parse native Logseq database export format', async () => {
      const importer = new OntologyImporter()
      // Native format uses tagged EDN with namespace reader macros
      const content = `{
        :properties #:user.property{
          :email-abc123 {
            :block/title "email"
            :db/cardinality "db.cardinality/one"
            :logseq.property/type "url"
          }
          :status-def456 {
            :block/title "status"
            :db/cardinality "db.cardinality/one"
            :logseq.property/type "default"
          }
        }
        :classes #:user.class{
          :person-ghi789 {
            :block/title "Person"
            :build/class-properties ["user.property/email-abc123"]
          }
        }
      }`

      const preview = await importer.preview(content)

      // Should parse properties from native format
      expect(preview.newProperties.length).toBeGreaterThanOrEqual(1)
      const emailProp = preview.newProperties.find(p => p.name === 'email')
      expect(emailProp).toBeDefined()
      expect(emailProp?.type).toBe('url')

      // Should parse classes from native format
      expect(preview.newClasses.length).toBeGreaterThanOrEqual(1)
      const personClass = preview.newClasses.find(c => c.name === 'Person')
      expect(personClass).toBeDefined()
    })

    test('should handle simplified template format with keywords', async () => {
      const importer = new OntologyImporter()
      // Standard EDN format with keyword keys (colons)
      const content = `{
        :classes [{:name "TestClass" :description "A test class"}]
        :properties [{:name "testProp" :type :default}]
      }`

      const preview = await importer.preview(content)

      expect(preview.newClasses).toHaveLength(1)
      expect(preview.newClasses[0]?.name).toBe('TestClass')
      expect(preview.newProperties).toHaveLength(1)
      expect(preview.newProperties[0]?.name).toBe('testProp')
    })

    test('should report unresolved conflicts', async () => {
      // This test requires mocking getExistingOntology
      // For now, just verify the import completes
      const importer = new OntologyImporter({ conflictStrategy: 'ask' })
      const content = `{:classes [] :properties []}`

      const result = await importer.import(content)

      expect(result).toBeDefined()
      expect(typeof result.duration).toBe('number')
    })
  })

  describe('createEmptyOntology', () => {
    test('should create empty maps', () => {
      const ontology = createEmptyOntology()

      expect(ontology.classes).toBeInstanceOf(Map)
      expect(ontology.properties).toBeInstanceOf(Map)
      expect(ontology.classes.size).toBe(0)
      expect(ontology.properties.size).toBe(0)
    })
  })
})
