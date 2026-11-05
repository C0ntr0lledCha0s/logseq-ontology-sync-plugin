import { ancestors } from '../library/parse'
import type { Ident, Library, Preset } from '../library/types'
import type {
  ClassSelection,
  Override,
  PropertySelection,
  RoleDefinition,
  Selection,
  Source,
} from './types'

/**
 * Computes which classes and per-class properties are on, and where each came from.
 * Pure; unknown idents are reported in `missing` rather than thrown.
 */
export function computeSelection(lib: Library, presets: Preset[], role: RoleDefinition): Selection {
  const missing = new Set<string>()
  const selected: Preset[] = []
  for (const id of role.presets) {
    const preset = presets.find((p) => p.id === id)
    if (preset) selected.push(preset)
    else missing.add(`role:${id}`)
  }

  // Direct inclusion: preset-listed classes, then class overrides.
  const presetSources = new Map<Ident, Source[]>()
  for (const preset of selected) {
    for (const cls of preset.classes.keys()) {
      if (!lib.classes.has(cls)) {
        missing.add(cls)
        continue
      }
      const list = presetSources.get(cls) ?? []
      list.push({ kind: 'preset', id: preset.id })
      presetSources.set(cls, list)
    }
  }
  const included = new Set<Ident>(presetSources.keys())
  for (const cls of Object.keys(role.classOverrides)) {
    if (lib.classes.has(cls)) included.add(cls)
    else missing.add(cls)
  }

  // Ancestors of included classes that are on get `parent`.
  const isOn = (cls: Ident): boolean => {
    const override = role.classOverrides[cls]
    return override ? override === 'on' : (presetSources.get(cls)?.length ?? 0) > 0
  }
  const parentOf = new Set<Ident>()
  for (const cls of [...included].filter(isOn)) {
    for (const parent of ancestors(lib, cls)) {
      parentOf.add(parent)
      included.add(parent)
    }
  }

  const classes = new Map<Ident, ClassSelection>()
  for (const [ident, def] of lib.classes) {
    if (!included.has(ident)) continue
    const userOverride = role.classOverrides[ident]
    const sources: Source[] = [...(presetSources.get(ident) ?? [])]
    if (userOverride === 'on' && sources.length === 0) sources.push({ kind: 'user' })
    if (parentOf.has(ident)) sources.push({ kind: 'parent' })

    const listed = new Map<Ident, Source[]>()
    for (const preset of selected) {
      for (const prop of preset.classes.get(ident) ?? []) {
        if (!def.properties.includes(prop)) {
          missing.add(`${ident}|${prop}`)
          continue
        }
        const list = listed.get(prop) ?? []
        list.push({ kind: 'preset', id: preset.id })
        listed.set(prop, list)
      }
    }
    const propOverrides = new Map<Ident, Override>()
    for (const [key, value] of Object.entries(role.propertyOverrides)) {
      const sep = key.indexOf('|')
      if (key.slice(0, sep) !== ident) continue
      const prop = key.slice(sep + 1)
      if (def.properties.includes(prop)) propOverrides.set(prop, value)
      else missing.add(key)
    }

    const properties: PropertySelection[] = def.properties.map((prop) => {
      const override = propOverrides.get(prop)
      const propSources: Source[] = [...(listed.get(prop) ?? [])]
      if (override === 'on' && propSources.length === 0) propSources.push({ kind: 'user' })
      const selection: PropertySelection = {
        ident: prop,
        on: override ? override === 'on' : propSources.length > 0,
        sources: propSources,
      }
      if (override) selection.userOverride = override
      return selection
    })

    const selection: ClassSelection = {
      ident,
      on: userOverride ? userOverride === 'on' : sources.length > 0,
      sources,
      properties,
    }
    if (userOverride) selection.userOverride = userOverride
    classes.set(ident, selection)
  }

  // Property overrides on classes that are not in the library.
  for (const key of Object.keys(role.propertyOverrides)) {
    const cls = key.slice(0, key.indexOf('|'))
    if (!lib.classes.has(cls)) missing.add(cls)
  }

  return { classes, missing: [...missing] }
}
