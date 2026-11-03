import { ancestors } from '../../library/parse'
import { exportedClasses } from '../../role/export'
import type { Ident, Library, Preset } from '../../library/types'
import type { RoleDefinition, Selection, Source } from '../../role/types'

export interface TagVM {
  label: string
  kind: 'preset' | 'user' | 'parent'
}

export interface RowVM {
  ident: Ident
  title: string
  on: boolean
  tags: TagVM[]
  typeLabel: string
  offByYou: boolean
  notInPreset: boolean
  /** On, but none of its target classes are exported, so it will link to any page. */
  linksToAnyPage: boolean
}

export interface SectionVM {
  ident: Ident
  title: string
  on: boolean
  tags: TagVM[]
  parentTitle?: string
  rows: RowVM[]
}

export interface BuilderVM {
  presetChips: { id: string; name: string; selected: boolean }[]
  contents: {
    ident: Ident
    title: string
    depth: number
    on: boolean
    onCount: number
    total: number
  }[]
  sections: SectionVM[]
  totals: { classes: number; propertiesOn: number; propertiesTotal: number }
  notices: string[]
}

function localName(ident: Ident): string {
  return ident.slice(ident.indexOf('/') + 1)
}

/** Longest chain of parents above `cls` (cycle-safe). */
function depthOf(lib: Library, cls: Ident, visiting: Set<Ident> = new Set()): number {
  const def = lib.classes.get(cls)
  if (!def || visiting.has(cls)) return 0
  visiting.add(cls)
  let max = -1
  for (const parent of def.parents) max = Math.max(max, depthOf(lib, parent, visiting))
  visiting.delete(cls)
  return max + 1
}

/** Depth-first: each class followed by its children, siblings in library order. */
function hierarchyOrder(lib: Library, entries: BuilderVM['contents']): BuilderVM['contents'] {
  const present = new Set(entries.map((e) => e.ident))
  const hasPresentParent = (e: BuilderVM['contents'][number]): boolean =>
    (lib.classes.get(e.ident)?.parents ?? []).some((p) => present.has(p))
  const out: BuilderVM['contents'] = []
  const seen = new Set<Ident>()
  const visit = (e: BuilderVM['contents'][number]): void => {
    if (seen.has(e.ident)) return
    seen.add(e.ident)
    out.push(e)
    for (const child of entries) {
      if (lib.classes.get(child.ident)?.parents.includes(e.ident)) visit(child)
    }
  }
  for (const e of entries) if (!hasPresentParent(e)) visit(e)
  for (const e of entries) visit(e) // anything only reachable through a cycle
  return out
}

/** Pure projection of the selection into what the builder shows. */
export function toViewModel(
  lib: Library,
  presets: Preset[],
  role: RoleDefinition,
  sel: Selection
): BuilderVM {
  const presetName = (id: string): string => presets.find((p) => p.id === id)?.name ?? id
  const tagOf = (source: Source): TagVM => {
    if (source.kind === 'preset') return { label: presetName(source.id), kind: 'preset' }
    if (source.kind === 'user') return { label: 'added by you', kind: 'user' }
    return { label: 'parent', kind: 'parent' }
  }
  const classTitle = (ident: Ident): string => lib.classes.get(ident)?.title ?? localName(ident)

  const typeLabel = (prop: Ident): string => {
    const def = lib.properties.get(prop)
    if (!def) throw new Error(`${prop}: unknown property`)
    if (def.type === 'node' && def.targetClasses.length > 0) {
      return `→ ${def.targetClasses.map(classTitle).join(', ')}`
    }
    return def.type === 'default' ? 'text' : def.type
  }

  const exported = exportedClasses(lib, sel)
  const onChildren = (cls: Ident): string[] =>
    [...sel.classes.values()]
      .filter((c) => c.on && ancestors(lib, c.ident).includes(cls))
      .map((c) => classTitle(c.ident))
  const linksToAnyPage = (prop: Ident): boolean => {
    const def = lib.properties.get(prop)
    if (!def) throw new Error(`${prop}: unknown property`)
    return (
      def.type === 'node' &&
      def.targetClasses.length > 0 &&
      !def.targetClasses.some((c) => exported.has(c))
    )
  }

  const contents: BuilderVM['contents'] = []
  const sections: SectionVM[] = []
  const totals = { classes: 0, propertiesOn: 0, propertiesTotal: 0 }

  for (const cls of sel.classes.values()) {
    const def = lib.classes.get(cls.ident)
    if (!def) throw new Error(`${cls.ident}: unknown class`)
    const onCount = cls.properties.filter((p) => p.on).length
    contents.push({
      ident: cls.ident,
      title: def.title,
      depth: depthOf(lib, cls.ident),
      on: cls.on,
      onCount,
      total: cls.properties.length,
    })
    if (cls.on) {
      totals.classes += 1
      totals.propertiesOn += onCount
      totals.propertiesTotal += cls.properties.length
    }

    const section: SectionVM = {
      ident: cls.ident,
      title: def.title,
      on: cls.on,
      tags: cls.sources.map((src) =>
        src.kind === 'parent' && !cls.on
          ? {
              label: `kept as parent of ${onChildren(cls.ident).join(', ')}`,
              kind: 'parent' as const,
            }
          : tagOf(src)
      ),
      rows: cls.properties.map((p) => ({
        ident: p.ident,
        title: lib.properties.get(p.ident)?.title ?? localName(p.ident),
        on: p.on,
        tags: p.sources.map(tagOf),
        typeLabel: typeLabel(p.ident),
        offByYou: !p.on && p.userOverride === 'off' && p.sources.length > 0,
        notInPreset: !p.on && p.sources.length === 0,
        linksToAnyPage: p.on && linksToAnyPage(p.ident),
      })),
    }
    if (def.parents.length > 0) section.parentTitle = def.parents.map(classTitle).join(', ')
    sections.push(section)
  }

  return {
    presetChips: presets.map((p) => ({
      id: p.id,
      name: p.name,
      selected: role.presets.includes(p.id),
    })),
    contents: hierarchyOrder(lib, contents),
    sections,
    totals,
    notices: sel.missing.length > 0 ? [`Not in the library: ${sel.missing.join(', ')}`] : [],
  }
}
