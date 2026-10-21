import { isMap, kw, mapGet, type EdnMap, type EdnValue } from '../edn/value'
import { ancestors } from '../library/parse'
import type { Ident, Library } from '../library/types'
import type { Selection } from './types'

/** What was exported; stored with the role to warn about conflicts on later exports. */
export interface ExportSnapshot {
  properties: Record<Ident, { type: string; cardinality: 'one' | 'many' }>
  classProperties: Record<Ident, Ident[]>
}

interface ExportPlan {
  /** Exported class idents in library order, with their exported class-properties. */
  classes: Map<Ident, Ident[]>
  /** Exported property idents in library order. */
  properties: Set<Ident>
}

function builtPropertyKeys(lib: Library, raw: EdnMap): Ident[] {
  const inner = mapGet(raw, 'build/properties')
  if (!isMap(inner)) return []
  const out: Ident[] = []
  for (const key of inner.keys()) {
    const ident = (key as { kw: string }).kw
    if (lib.properties.has(ident)) out.push(ident)
  }
  return out
}

function plan(lib: Library, sel: Selection): ExportPlan {
  const exported = new Set<Ident>()
  for (const cls of sel.classes.values()) {
    if (!cls.on) continue
    exported.add(cls.ident)
    for (const parent of ancestors(lib, cls.ident)) exported.add(parent)
  }

  const classes = new Map<Ident, Ident[]>()
  const wanted = new Set<Ident>()
  for (const [ident, def] of lib.classes) {
    if (!exported.has(ident)) continue
    const selection = sel.classes.get(ident)
    if (!selection) throw new Error(`${ident}: exported class missing from selection`)
    const props = selection.properties.filter((p) => p.on).map((p) => p.ident)
    classes.set(ident, props)
    for (const p of props) wanted.add(p)
    for (const p of builtPropertyKeys(lib, def.raw)) wanted.add(p)
  }

  // Pull in properties referenced from `:build/properties` of exported properties, transitively.
  const queue = [...wanted]
  while (queue.length > 0) {
    const ident = queue.pop() as Ident
    const def = lib.properties.get(ident)
    if (!def) throw new Error(`${ident}: unknown property`)
    for (const p of builtPropertyKeys(lib, def.raw)) {
      if (wanted.has(p)) continue
      wanted.add(p)
      queue.push(p)
    }
  }

  const properties = new Set<Ident>()
  for (const ident of lib.properties.keys()) if (wanted.has(ident)) properties.add(ident)
  return { classes, properties }
}

/** Builds the trimmed `:graph-ontology` EDN for Logseq's Import → EDN to DB Graph. */
export function buildExport(lib: Library, sel: Selection): { edn: EdnMap; notes: string[] } {
  const { classes, properties } = plan(lib, sel)
  const notes: string[] = []

  const classesOut: EdnMap = new Map()
  for (const [ident, props] of classes) {
    const def = lib.classes.get(ident)
    if (!def) throw new Error(`${ident}: unknown class`)
    const entry: EdnMap = new Map()
    for (const [k, v] of def.raw) {
      if (k === kw('build/class-properties')) {
        if (props.length > 0)
          entry.set(
            k,
            props.map((p) => kw(p))
          )
      } else {
        entry.set(k, v)
      }
    }
    classesOut.set(kw(ident), entry)
  }

  const propertiesOut: EdnMap = new Map()
  for (const ident of properties) {
    const def = lib.properties.get(ident)
    if (!def) throw new Error(`${ident}: unknown property`)
    const entry: EdnMap = new Map()
    for (const [k, v] of def.raw) {
      if (k !== kw('build/property-classes')) {
        entry.set(k, v)
        continue
      }
      const kept = def.targetClasses.filter((c) => classes.has(c))
      if (kept.length > 0) entry.set(k, kept.map((c) => kw(c)) as EdnValue)
      else notes.push(`${def.title} will link to any page`)
    }
    propertiesOut.set(kw(ident), entry)
  }

  const edn: EdnMap = new Map<EdnValue, EdnValue>([
    [kw('logseq.db.sqlite.export/export-type'), kw('graph-ontology')],
    [kw('properties'), propertiesOut],
    [kw('classes'), classesOut],
  ])
  return { edn, notes }
}

export function snapshotOf(lib: Library, sel: Selection): ExportSnapshot {
  const { classes, properties } = plan(lib, sel)
  const snapshot: ExportSnapshot = { properties: {}, classProperties: {} }
  for (const ident of properties) {
    const def = lib.properties.get(ident)
    if (!def) throw new Error(`${ident}: unknown property`)
    snapshot.properties[ident] = { type: def.type, cardinality: def.cardinality }
  }
  for (const [ident, props] of classes) snapshot.classProperties[ident] = props
  return snapshot
}

export function exportFileName(roleName: string): string {
  const base = roleName
    .toLowerCase()
    .replace(/ /g, '-')
    .replace(/[^a-z0-9-]/g, '')
  return `${base === '' ? 'role' : base}.edn`
}
