import type { StoredRole } from '../logseq/role-store'
import type { RoleDefinition } from './types'

const FORMAT = 'ontology-schema'
const VERSION = 1
const NOT_A_ROLE = 'Not an ontology schema file'

/** Serialise a schema for sharing. `lastExport` is per-graph state and is left out. */
export function roleToFile(role: StoredRole): string {
  const { name, libraryVersion, presets, classOverrides, propertyOverrides } = role
  const definition: RoleDefinition = {
    name,
    libraryVersion,
    presets,
    classOverrides,
    propertyOverrides,
  }
  return JSON.stringify({ format: FORMAT, version: VERSION, schema: definition }, null, 2)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isOverrideMap(v: unknown): v is Record<string, 'on' | 'off'> {
  return isRecord(v) && Object.values(v).every((x) => x === 'on' || x === 'off')
}

/** Why `name` cannot be a schema name, or null when it is fine. */
export function roleNameError(name: string): string | null {
  if (name.trim() === '') return 'Enter a name for the schema'
  if (name === '__new__') return 'The schema name "__new__" is reserved'
  if (name.includes('#') || name.includes('[[') || name.includes(']]')) {
    return 'A schema name cannot contain "#", "[[" or "]]"'
  }
  return null
}

/** Validates the shape and name of a schema definition; throws with a specific message. */
export function parseRoleDefinition(r: unknown): RoleDefinition {
  if (
    !isRecord(r) ||
    typeof r.name !== 'string' ||
    typeof r.libraryVersion !== 'string' ||
    !Array.isArray(r.presets) ||
    !r.presets.every((p) => typeof p === 'string') ||
    !isOverrideMap(r.classOverrides) ||
    !isOverrideMap(r.propertyOverrides)
  ) {
    throw new Error(NOT_A_ROLE)
  }
  const nameError = roleNameError(r.name)
  if (nameError) throw new Error(`${NOT_A_ROLE}: ${nameError}`)
  return {
    name: r.name,
    libraryVersion: r.libraryVersion,
    presets: r.presets,
    classOverrides: r.classOverrides,
    propertyOverrides: r.propertyOverrides,
  }
}

export function roleFromFile(text: string): RoleDefinition {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(NOT_A_ROLE)
  }
  if (!isRecord(data) || data.format !== FORMAT || data.version !== VERSION) {
    throw new Error(NOT_A_ROLE)
  }
  return parseRoleDefinition(data.schema)
}
