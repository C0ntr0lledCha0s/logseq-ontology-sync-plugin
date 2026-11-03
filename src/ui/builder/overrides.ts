import type { Ident, Library, Preset } from '../../library/types'
import { computeSelection } from '../../role/selection'
import type { RoleDefinition } from '../../role/types'

const propKey = (cls: Ident, prop: Ident): string => `${cls}|${prop}`

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record }
  delete copy[key]
  return copy
}

/** Whether the class is on when it carries no class override of its own. */
function classDefault(lib: Library, presets: Preset[], role: RoleDefinition, cls: Ident): boolean {
  const bare = { ...role, classOverrides: without(role.classOverrides, cls) }
  return computeSelection(lib, presets, bare).classes.get(cls)?.on ?? false
}

function propertyDefault(
  lib: Library,
  presets: Preset[],
  role: RoleDefinition,
  cls: Ident,
  prop: Ident
): boolean {
  const bare = { ...role, propertyOverrides: without(role.propertyOverrides, propKey(cls, prop)) }
  const selection = computeSelection(lib, presets, bare).classes.get(cls)
  return selection?.properties.find((p) => p.ident === prop)?.on ?? false
}

function hasUserOnProperty(role: RoleDefinition, cls: Ident): boolean {
  const prefix = `${cls}|`
  return Object.entries(role.propertyOverrides).some(([k, v]) => k.startsWith(prefix) && v === 'on')
}

/**
 * Drops a class override that matches the preset default, unless it is an 'on' that a user-added
 * property in that class relies on to survive unticking presets.
 */
function normalizeClass(
  lib: Library,
  presets: Preset[],
  role: RoleDefinition,
  cls: Ident
): RoleDefinition {
  const override = role.classOverrides[cls]
  if (!override) return role
  const matchesDefault = (override === 'on') === classDefault(lib, presets, role, cls)
  const needed = override === 'on' && hasUserOnProperty(role, cls)
  if (!matchesDefault || needed) return role
  return { ...role, classOverrides: without(role.classOverrides, cls) }
}

export function togglePreset(role: RoleDefinition, id: string): RoleDefinition {
  const presets = role.presets.includes(id)
    ? role.presets.filter((p) => p !== id)
    : [...role.presets, id]
  return { ...role, presets }
}

export function setClass(
  lib: Library,
  presets: Preset[],
  role: RoleDefinition,
  cls: Ident,
  on: boolean
): RoleDefinition {
  const next = {
    ...role,
    classOverrides: { ...role.classOverrides, [cls]: on ? ('on' as const) : ('off' as const) },
  }
  return normalizeClass(lib, presets, next, cls)
}

export function setProperty(
  lib: Library,
  presets: Preset[],
  role: RoleDefinition,
  cls: Ident,
  prop: Ident,
  on: boolean
): RoleDefinition {
  const key = propKey(cls, prop)
  const matchesDefault = on === propertyDefault(lib, presets, role, cls, prop)
  let next: RoleDefinition = {
    ...role,
    propertyOverrides: matchesDefault
      ? without(role.propertyOverrides, key)
      : { ...role.propertyOverrides, [key]: on ? 'on' : 'off' },
  }
  if (on) {
    // A property the user switched on must keep its class in when presets are unticked.
    const classOn = computeSelection(lib, presets, next).classes.get(cls)?.on ?? false
    if (next.propertyOverrides[key] === 'on' || !classOn) {
      next = { ...next, classOverrides: { ...next.classOverrides, [cls]: 'on' } }
    }
  }
  return normalizeClass(lib, presets, next, cls)
}
