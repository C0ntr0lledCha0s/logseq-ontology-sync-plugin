import { isKw, isMap, mapGet, type EdnMap, type EdnValue } from '../edn/value'
import { readEdn } from '../edn/read'
import type { ClassDef, Ident, Library, PropertyDef, Preset } from './types'

function rootMap(text: string, what: string): EdnMap {
  const root = readEdn(text)
  if (!isMap(root)) throw new Error(`${what}: top-level value must be a map`)
  return root
}

function readVersion(root: EdnMap, what: string): string {
  const version = mapGet(root, 'schema-library/version')
  if (typeof version !== 'string' || version === '') {
    throw new Error(`${what}: missing :schema-library/version`)
  }
  return version
}

function requireMap(root: EdnMap, key: string, what: string): EdnMap {
  const v = mapGet(root, key)
  if (!isMap(v)) throw new Error(`${what}: missing or invalid :${key}`)
  return v
}

function keywordName(v: EdnValue, ident: string, field: string): Ident {
  if (!isKw(v)) throw new Error(`${ident}: ${field} must contain keywords`)
  return v.kw
}

function identList(entry: EdnMap, key: string, ident: string): Ident[] {
  const v = mapGet(entry, key)
  if (v === undefined) return []
  if (!Array.isArray(v)) throw new Error(`${ident}: :${key} must be a vector`)
  return v.map((x) => keywordName(x, ident, `:${key}`))
}

function entryMap(v: EdnValue | undefined, ident: string): EdnMap {
  if (!isMap(v)) throw new Error(`${ident}: entry must be a map`)
  return v
}

function title(entry: EdnMap, ident: string): string {
  const t = mapGet(entry, 'block/title')
  if (typeof t !== 'string') throw new Error(`${ident}: missing :block/title`)
  return t
}

function parseClass(ident: Ident, value: EdnValue | undefined): ClassDef {
  const raw = entryMap(value, ident)
  return {
    ident,
    title: title(raw, ident),
    parents: identList(raw, 'build/class-extends', ident),
    properties: identList(raw, 'build/class-properties', ident),
    raw,
  }
}

function parseProperty(ident: Ident, value: EdnValue | undefined): PropertyDef {
  const raw = entryMap(value, ident)
  const type = mapGet(raw, 'logseq.property/type')
  if (!isKw(type)) throw new Error(`${ident}: missing :logseq.property/type`)
  const card = mapGet(raw, 'db/cardinality')
  if (!isKw(card, 'db.cardinality/one') && !isKw(card, 'db.cardinality/many')) {
    throw new Error(`${ident}: missing or invalid :db/cardinality`)
  }
  return {
    ident,
    title: title(raw, ident),
    type: type.kw,
    cardinality: card.kw === 'db.cardinality/many' ? 'many' : 'one',
    targetClasses: identList(raw, 'build/property-classes', ident),
    raw,
  }
}

export function parseLibrary(text: string): Library {
  const root = rootMap(text, 'library')
  const version = readVersion(root, 'library')
  const classes = new Map<Ident, ClassDef>()
  for (const [k, v] of requireMap(root, 'classes', 'library')) {
    const ident = keywordName(k, 'classes', 'key')
    classes.set(ident, parseClass(ident, v))
  }
  const properties = new Map<Ident, PropertyDef>()
  for (const [k, v] of requireMap(root, 'properties', 'library')) {
    const ident = keywordName(k, 'properties', 'key')
    properties.set(ident, parseProperty(ident, v))
  }
  return { version, classes, properties }
}

function str(entry: EdnMap, key: string, id: string): string {
  const v = mapGet(entry, key)
  if (typeof v !== 'string') throw new Error(`preset ${id}: missing :${key}`)
  return v
}

function parsePreset(value: EdnValue, index: number): Preset {
  const entry = entryMap(value, `preset #${index}`)
  const id = str(entry, 'id', `#${index}`)
  const classes = new Map<Ident, Ident[]>()
  for (const [k, v] of requireMap(entry, 'classes', `preset ${id}`)) {
    const cls = keywordName(k, `preset ${id}`, 'class key')
    if (!Array.isArray(v)) throw new Error(`preset ${id}: ${cls} must map to a vector`)
    classes.set(
      cls,
      v.map((x) => keywordName(x, `preset ${id}`, cls))
    )
  }
  return { id, name: str(entry, 'name', id), description: str(entry, 'description', id), classes }
}

export function parsePresets(text: string): { version: string; presets: Preset[] } {
  const root = rootMap(text, 'presets')
  const version = readVersion(root, 'presets')
  const list = mapGet(root, 'presets')
  if (!Array.isArray(list)) throw new Error('presets: missing or invalid :presets')
  return { version, presets: list.map(parsePreset) }
}

/** Logseq built-ins such as `logseq.class/Task` exist in every graph, so a library may extend them. */
const isBuiltIn = (ident: Ident): boolean => ident.startsWith('logseq.')

/**
 * All library ancestors, breadth-first (nearest first), deduplicated, cycle-safe.
 * Built-in parents are skipped: they are never exported but stay in the class's raw `:build/class-extends`.
 */
export function ancestors(lib: Library, cls: Ident): Ident[] {
  const seen = new Set<Ident>([cls])
  const out: Ident[] = []
  let frontier: Ident[] = [cls]
  while (frontier.length > 0) {
    const next: Ident[] = []
    for (const ident of frontier) {
      const def = lib.classes.get(ident)
      if (!def) throw new Error(`${ident}: unknown class`)
      for (const p of def.parents) {
        if (seen.has(p) || isBuiltIn(p)) continue
        seen.add(p)
        out.push(p)
        next.push(p)
      }
    }
    frontier = next
  }
  return out
}
