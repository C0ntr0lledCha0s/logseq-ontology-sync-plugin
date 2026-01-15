/**
 * Type Converters
 *
 * Provides conversion functions between different type representations used
 * across the plugin modules. These converters enable seamless data flow between:
 *
 * - **Parser types** - UUID-based, from EDN parsing
 * - **Import types** - Simplified, for diff comparison
 * - **API types** - Storage format, for Logseq database operations
 * - **Sync types** - Source-based, for synchronization workflows
 *
 * @module converters
 *
 * @remarks
 * The plugin has multiple modules that evolved independently, each with their
 * own type definitions. These converters bridge the differences to provide
 * a unified data model.
 *
 * Conversion Directions:
 * ```
 * EDN File -> Parser -> Unified Types -> API -> Logseq DB
 *                         ^
 *                         |
 * Import Module ----------+
 *                         |
 * Sync Module ------------+
 * ```
 *
 * @example
 * ```typescript
 * import { parserPropertyToUnified, unifiedPropertyToApi } from './converters'
 *
 * // Convert parsed EDN property to unified type
 * const unified = parserPropertyToUnified(parsedProperty)
 *
 * // Convert unified type to API format for Logseq
 * const apiFormat = unifiedPropertyToApi(unified)
 * ```
 */

import type {
  PropertyDefinition,
  ClassDefinition,
  ImportPreview,
  Source,
  UUID,
  SimpleParsedTemplate,
  ParsedTemplate,
  ExistingOntology,
} from './index'

// Import legacy types for conversion
import type { PropertyDefinition as ParserPropertyDef } from '../parser/types'
import type { ClassDefinition as ParserClassDef } from '../parser/types'
import type { PropertyDefinition as ApiPropertyDef } from '../api/types'
import type { ClassDefinition as ApiClassDef } from '../api/types'
import type { PropertyEntity, ClassEntity } from '../api/types'
import type { TemplateSource } from '../sources/types'
import type { SyncSource } from '../sync/types'
import type { ImportPreview as SyncImportPreview } from '../sync/types'
import type { ImportPreview as ImportModulePreview } from '../import/types'

// ============================================================================
// UUID Helpers
// ============================================================================

/**
 * Type guard to check if a value is a UUID object
 *
 * @param value - The value to check
 * @returns True if the value is a UUID object with a `uuid` string property
 *
 * @example
 * ```typescript
 * const maybeUuid: unknown = { uuid: '123e4567-e89b-12d3-a456-426614174000' }
 * if (isUUID(maybeUuid)) {
 *   console.log(maybeUuid.uuid) // Type-safe access
 * }
 * ```
 */
export function isUUID(value: unknown): value is UUID {
  return (
    typeof value === 'object' &&
    value !== null &&
    'uuid' in value &&
    typeof (value as UUID).uuid === 'string'
  )
}

/**
 * Extract UUID string from a UUID object or pass through a string as-is
 *
 * @param value - UUID object, string, or undefined
 * @returns The UUID string, or undefined if input is undefined
 *
 * @example
 * ```typescript
 * extractUuidString({ uuid: 'abc-123' }) // Returns: 'abc-123'
 * extractUuidString('abc-123')           // Returns: 'abc-123'
 * extractUuidString(undefined)           // Returns: undefined
 * ```
 */
export function extractUuidString(value: UUID | string | undefined): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  return value.uuid
}

/**
 * Convert a UUID string to a UUID object
 *
 * @param uuid - The UUID string
 * @returns A UUID object wrapping the string
 *
 * @example
 * ```typescript
 * const id = toUUID('123e4567-e89b-12d3-a456-426614174000')
 * // Result: { uuid: '123e4567-e89b-12d3-a456-426614174000' }
 * ```
 */
export function toUUID(uuid: string): UUID {
  return { uuid }
}

// ============================================================================
// Property Converters
// ============================================================================

/**
 * Convert parser PropertyDefinition to unified PropertyDefinition
 *
 * Transforms the parser module's property type (with UUID objects for class references)
 * to the unified format (with string arrays for class references).
 *
 * @param p - Property definition from the parser module
 * @returns Unified property definition
 *
 * @example
 * ```typescript
 * const parsed = parseEdn(ednContent)
 * const properties = Array.from(parsed.properties.values())
 *   .map(parserPropertyToUnified)
 * ```
 */
export function parserPropertyToUnified(p: ParserPropertyDef): PropertyDefinition {
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    cardinality: p.cardinality,
    description: p.description,
    originalKey: p.originalKey,
    closed: p.closed,
    closedValues: p.closedValues,
    position: p.position,
    hide: p.hide,
    classes: p.classes?.map((c) => c.uuid),
    rawData: p.rawData,
  }
}

/**
 * Convert unified PropertyDefinition to API format
 *
 * Transforms the unified property type to the format expected by the Logseq API
 * for creating or updating properties in the database.
 *
 * @param p - Unified property definition
 * @returns API-compatible property definition
 *
 * @example
 * ```typescript
 * const property = { name: 'my-prop', type: 'default', cardinality: 'one' }
 * const apiProp = unifiedPropertyToApi(property)
 * await api.createProperty(apiProp)
 * ```
 */
export function unifiedPropertyToApi(p: PropertyDefinition): ApiPropertyDef {
  return {
    name: p.name,
    title: p.title,
    description: p.description,
    type: p.type,
    cardinality: p.cardinality,
    hide: p.hide,
    schemaVersion: p.schemaVersion ?? 1,
    classes: p.classes,
    defaultValue: p.defaultValue,
    choices: p.choices ?? p.closedValues?.map((cv) => cv.value),
  }
}

/**
 * Convert PropertyEntity (from Logseq) to unified PropertyDefinition
 */
export function propertyEntityToUnified(entity: PropertyEntity): PropertyDefinition {
  return {
    name: entity.name,
    title: entity.originalName,
    type: entity.type,
    cardinality: entity.cardinality,
    hide: entity.hide,
    schemaVersion: entity.schemaVersion,
    classes: entity.classes,
  }
}

/**
 * Convert unified PropertyDefinition to simplified import format
 */
export function unifiedPropertyToSimple(p: PropertyDefinition): {
  name: string
  type: string
  cardinality?: 'one' | 'many'
  description?: string
} {
  return {
    name: p.name,
    type: p.type,
    cardinality: p.cardinality,
    description: p.description,
  }
}

// ============================================================================
// Class Converters
// ============================================================================

/**
 * Convert parser ClassDefinition to unified ClassDefinition
 */
export function parserClassToUnified(c: ParserClassDef): ClassDefinition {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    originalKey: c.originalKey,
    parents: c.parents,
    parent: c.parents?.[0]?.uuid,
    properties: c.properties?.map((p) => p.uuid),
    position: c.position,
    rawData: c.rawData,
  }
}

/**
 * Convert unified ClassDefinition to API format
 */
export function unifiedClassToApi(c: ClassDefinition): ApiClassDef {
  return {
    name: c.name,
    title: c.title,
    description: c.description,
    parent: c.parent,
    properties: c.properties,
    icon: c.icon,
    schemaVersion: c.schemaVersion ?? 1,
  }
}

/**
 * Convert ClassEntity (from Logseq) to unified ClassDefinition
 */
export function classEntityToUnified(entity: ClassEntity): ClassDefinition {
  return {
    name: entity.name,
    title: entity.originalName,
    parent: entity.parent,
    properties: entity.properties,
    schemaVersion: entity.schemaVersion,
  }
}

/**
 * Convert unified ClassDefinition to simplified import format
 */
export function unifiedClassToSimple(c: ClassDefinition): {
  name: string
  parent?: string
  description?: string
  properties?: string[]
} {
  return {
    name: c.name,
    parent: c.parent,
    description: c.description,
    properties: c.properties,
  }
}

// ============================================================================
// Source Converters
// ============================================================================

/**
 * Convert TemplateSource to unified Source
 */
export function templateSourceToUnified(ts: TemplateSource): Source {
  return {
    id: ts.id,
    name: ts.name,
    location: ts.location,
    type: ts.type,
    enabled: ts.enabled,
    description: ts.description,
    version: ts.version,
    lastFetched: ts.lastFetched,
    checksum: ts.checksum,
  }
}

/**
 * Convert SyncSource to unified Source
 */
export function syncSourceToUnified(ss: SyncSource): Source {
  return {
    id: ss.id,
    name: ss.name,
    location: ss.url,
    type: ss.type === 'file' ? 'local' : ss.type,
    enabled: true,
    syncStrategy: ss.defaultStrategy,
  }
}

/**
 * Convert unified Source to TemplateSource format
 */
export function unifiedSourceToTemplate(s: Source): TemplateSource {
  return {
    id: s.id,
    name: s.name,
    type: s.type === 'github' ? 'url' : s.type,
    location: s.location,
    description: s.description,
    version: s.version,
    lastFetched: s.lastFetched,
    checksum: s.checksum,
    enabled: s.enabled,
  }
}

/**
 * Convert unified Source to SyncSource format
 */
export function unifiedSourceToSync(s: Source): SyncSource {
  return {
    id: s.id,
    name: s.name,
    url: s.location,
    type: s.type === 'local' ? 'file' : s.type,
    defaultStrategy: s.syncStrategy ?? 'ask',
  }
}

// ============================================================================
// ImportPreview Converters
// ============================================================================

/**
 * Convert sync-style ImportPreview to unified ImportPreview
 */
export function syncPreviewToUnified(preview: SyncImportPreview): ImportPreview {
  return {
    newClasses: preview.classesToAdd.map((name) => ({
      name,
      type: 'default' as const,
      cardinality: 'one' as const,
    })),
    updatedClasses: preview.classesToUpdate.map((name) => ({
      name,
      before: {},
      after: {},
      changes: [],
    })),
    newProperties: preview.propertiesToAdd.map((name) => ({
      name,
      type: 'default' as const,
      cardinality: 'one' as const,
    })),
    updatedProperties: preview.propertiesToUpdate.map((name) => ({
      name,
      before: {},
      after: {},
      changes: [],
    })),
    classesToRemove: preview.classesToRemove,
    propertiesToRemove: preview.propertiesToRemove,
    conflicts: [],
    summary: {
      totalNew: preview.classesToAdd.length + preview.propertiesToAdd.length,
      totalUpdated: preview.classesToUpdate.length + preview.propertiesToUpdate.length,
      totalRemoved: preview.classesToRemove.length + preview.propertiesToRemove.length,
      totalConflicts: 0,
    },
  }
}

/**
 * Convert import-style ImportPreview to unified ImportPreview
 */
export function importPreviewToUnified(preview: ImportModulePreview): ImportPreview {
  return {
    newClasses: preview.newClasses.map((c) => ({
      name: c.name,
      parent: c.parent,
      description: c.description,
      properties: c.properties,
    })),
    updatedClasses: preview.updatedClasses.map((u) => ({
      name: u.name,
      before: u.before,
      after: u.after,
      changes: u.changes,
    })),
    newProperties: preview.newProperties.map((p) => ({
      name: p.name,
      type: (p.type as PropertyDefinition['type']) || 'default',
      cardinality: p.cardinality || 'one',
      description: p.description,
    })),
    updatedProperties: preview.updatedProperties.map((u) => ({
      name: u.name,
      before: {
        ...u.before,
        type: (u.before.type as PropertyDefinition['type']) || undefined,
      } as Partial<PropertyDefinition>,
      after: {
        ...u.after,
        type: (u.after.type as PropertyDefinition['type']) || undefined,
      } as Partial<PropertyDefinition>,
      changes: u.changes,
    })),
    classesToRemove: [],
    propertiesToRemove: [],
    conflicts: preview.conflicts,
    summary: {
      totalNew: preview.summary.totalNew,
      totalUpdated: preview.summary.totalUpdated,
      totalRemoved: 0,
      totalConflicts: preview.summary.totalConflicts,
    },
  }
}

/**
 * Convert unified ImportPreview to sync-style format
 */
export function unifiedPreviewToSync(preview: ImportPreview): SyncImportPreview {
  return {
    classesToAdd: preview.newClasses.map((c) => c.name),
    classesToUpdate: preview.updatedClasses.map((c) => c.name),
    classesToRemove: preview.classesToRemove,
    propertiesToAdd: preview.newProperties.map((p) => p.name),
    propertiesToUpdate: preview.updatedProperties.map((p) => p.name),
    propertiesToRemove: preview.propertiesToRemove,
  }
}

// ============================================================================
// Template Converters
// ============================================================================

/**
 * Convert Map-based ParsedTemplate to array-based SimpleParsedTemplate
 */
export function parsedTemplateToSimple(template: ParsedTemplate): SimpleParsedTemplate {
  return {
    classes: Array.from(template.classes.values()).map((c) =>
      parserClassToUnified(c as unknown as ParserClassDef)
    ),
    properties: Array.from(template.properties.values()).map((p) =>
      parserPropertyToUnified(p as unknown as ParserPropertyDef)
    ),
    metadata: {
      version: template.version,
    },
  }
}

/**
 * Convert array-based SimpleParsedTemplate to Map-based ParsedTemplate
 */
export function simpleToParsedTemplate(simple: SimpleParsedTemplate): ParsedTemplate {
  const properties = new Map<string, PropertyDefinition>()
  const classes = new Map<string, ClassDefinition>()

  for (const prop of simple.properties) {
    properties.set(prop.name, prop)
  }

  for (const cls of simple.classes) {
    classes.set(cls.name, cls)
  }

  return {
    properties,
    classes,
    exportType: 'ontology',
    version: simple.metadata?.version,
  }
}

// ============================================================================
// ExistingOntology Converters
// ============================================================================

/**
 * Create ExistingOntology from PropertyEntity and ClassEntity maps
 */
export function entitiesToExistingOntology(
  properties: Map<string, PropertyEntity>,
  classes: Map<string, ClassEntity>
): ExistingOntology {
  const ontologyProps = new Map<string, PropertyDefinition>()
  const ontologyClasses = new Map<string, ClassDefinition>()

  for (const [name, entity] of properties) {
    ontologyProps.set(name, propertyEntityToUnified(entity))
  }

  for (const [name, entity] of classes) {
    ontologyClasses.set(name, classEntityToUnified(entity))
  }

  return {
    properties: ontologyProps,
    classes: ontologyClasses,
  }
}

/**
 * Create empty ExistingOntology
 */
export function createEmptyOntology(): ExistingOntology {
  return {
    classes: new Map(),
    properties: new Map(),
  }
}
