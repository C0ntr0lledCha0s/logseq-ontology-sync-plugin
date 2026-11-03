import type { Ident } from '../library/types'
import type { ExportSnapshot } from './export'

export interface TypeConflict {
  ident: Ident
  exported: string
  graph: string
}

/** Properties present in both the export and the live graph whose type or cardinality differ. */
export function typeConflicts(
  snapshot: ExportSnapshot,
  live: Map<Ident, { type: string; cardinality: 'one' | 'many' }>
): TypeConflict[] {
  const out: TypeConflict[] = []
  for (const [ident, exported] of Object.entries(snapshot.properties)) {
    const graph = live.get(ident)
    if (!graph) continue
    if (graph.type !== exported.type || graph.cardinality !== exported.cardinality) {
      out.push({
        ident,
        exported: `${exported.type}/${exported.cardinality}`,
        graph: `${graph.type}/${graph.cardinality}`,
      })
    }
  }
  return out
}

/** Classes and class-properties exported previously but absent from the next export. */
export function removals(
  previous: ExportSnapshot | undefined,
  next: ExportSnapshot
): { classes: Ident[]; classProperties: string[] } {
  const result = { classes: [] as Ident[], classProperties: [] as string[] }
  if (!previous) return result
  for (const [cls, props] of Object.entries(previous.classProperties)) {
    const nextProps = next.classProperties[cls]
    if (!nextProps) {
      result.classes.push(cls)
      continue
    }
    for (const prop of props) {
      if (!nextProps.includes(prop)) result.classProperties.push(`${cls}|${prop}`)
    }
  }
  return result
}
