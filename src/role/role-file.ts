import type { StoredRole } from '../logseq/role-store'
import type { RoleDefinition } from './types'

const FORMAT = 'ontology-role'
const VERSION = 1
const NOT_A_ROLE = 'Not an ontology role file'

/** Serialise a role for sharing. `lastExport` is per-graph state and is left out. */
export function roleToFile(role: StoredRole): string {
  const { name, libraryVersion, presets, classOverrides, propertyOverrides } = role
  const definition: RoleDefinition = {
    name,
    libraryVersion,
    presets,
    classOverrides,
    propertyOverrides,
  }
  return JSON.stringify({ format: FORMAT, version: VERSION, role: definition }, null, 2)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isOverrideMap(v: unknown): v is Record<string, 'on' | 'off'> {
  return isRecord(v) && Object.values(v).every((x) => x === 'on' || x === 'off')
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
  const r = data.role
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
  return {
    name: r.name,
    libraryVersion: r.libraryVersion,
    presets: r.presets,
    classOverrides: r.classOverrides,
    propertyOverrides: r.propertyOverrides,
  }
}
