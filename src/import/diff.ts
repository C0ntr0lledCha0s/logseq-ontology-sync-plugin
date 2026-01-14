/**
 * Diff module for comparing templates with existing ontology state
 */

import type {
  ClassDefinition,
  PropertyDefinition,
  ClassUpdate,
  PropertyUpdate,
  Conflict,
  ParsedTemplate,
  ExistingOntology,
  ImportPreview,
} from './types'

/**
 * Compare two values and return list of changed fields
 */
function getChangedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): string[] {
  const changes: string[] = []
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])

  for (const key of allKeys) {
    const beforeVal = before[key]
    const afterVal = after[key]

    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changes.push(key)
    }
  }

  return changes
}

/**
 * Compare a template class with an existing class
 */
function compareClass(newClass: ClassDefinition, existing: ClassDefinition): ClassUpdate | null {
  const changes = getChangedFields(
    existing as unknown as Record<string, unknown>,
    newClass as unknown as Record<string, unknown>
  )

  if (changes.length === 0) {
    return null
  }

  return {
    name: newClass.name,
    before: existing,
    after: newClass,
    changes,
  }
}

/**
 * Compare a template property with an existing property
 */
function compareProperty(
  newProp: PropertyDefinition,
  existing: PropertyDefinition
): PropertyUpdate | null {
  const changes = getChangedFields(
    existing as unknown as Record<string, unknown>,
    newProp as unknown as Record<string, unknown>
  )

  if (changes.length === 0) {
    return null
  }

  return {
    name: newProp.name,
    before: existing,
    after: newProp,
    changes,
  }
}

/**
 * Detect conflicts between template and existing state
 */
function detectConflict(
  type: 'class' | 'property',
  name: string,
  existing: unknown,
  newValue: unknown,
  changedFields: string[]
): Conflict | null {
  // For now, any change to critical fields is a conflict
  const criticalFields = type === 'class' ? ['parent'] : ['type', 'cardinality']
  const hasCriticalChange = changedFields.some((f) => criticalFields.includes(f))

  if (hasCriticalChange) {
    return {
      type,
      name,
      reason: `Critical field(s) changed: ${changedFields.filter((f) => criticalFields.includes(f)).join(', ')}`,
      existingValue: existing,
      newValue,
    }
  }

  return null
}

/**
 * Generate a diff between a parsed template and existing ontology
 */
export function diffTemplate(template: ParsedTemplate, existing: ExistingOntology): ImportPreview {
  const newClasses: ClassDefinition[] = []
  const updatedClasses: ClassUpdate[] = []
  const newProperties: PropertyDefinition[] = []
  const updatedProperties: PropertyUpdate[] = []
  const conflicts: Conflict[] = []

  // Process classes
  for (const cls of template.classes) {
    const existingClass = existing.classes.get(cls.name)

    if (!existingClass) {
      newClasses.push(cls)
    } else {
      const update = compareClass(cls, existingClass)
      if (update) {
        updatedClasses.push(update)

        const conflict = detectConflict('class', cls.name, existingClass, cls, update.changes)
        if (conflict) {
          conflicts.push(conflict)
        }
      }
    }
  }

  // Process properties
  for (const prop of template.properties) {
    const existingProp = existing.properties.get(prop.name)

    if (!existingProp) {
      newProperties.push(prop)
    } else {
      const update = compareProperty(prop, existingProp)
      if (update) {
        updatedProperties.push(update)

        const conflict = detectConflict('property', prop.name, existingProp, prop, update.changes)
        if (conflict) {
          conflicts.push(conflict)
        }
      }
    }
  }

  return {
    newClasses,
    updatedClasses,
    newProperties,
    updatedProperties,
    conflicts,
    summary: {
      totalNew: newClasses.length + newProperties.length,
      totalUpdated: updatedClasses.length + updatedProperties.length,
      totalConflicts: conflicts.length,
    },
  }
}

/**
 * Create an empty existing ontology structure
 */
export function createEmptyOntology(): ExistingOntology {
  return {
    classes: new Map(),
    properties: new Map(),
  }
}
