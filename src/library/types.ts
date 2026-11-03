import type { EdnMap } from '../edn/value'

/** Keyword name without the leading colon, e.g. `schema.class/Person`. */
export type Ident = string

export interface ClassDef {
  ident: Ident
  title: string
  parents: Ident[]
  properties: Ident[]
  raw: EdnMap
}

export interface PropertyDef {
  ident: Ident
  title: string
  type: string
  cardinality: 'one' | 'many'
  targetClasses: Ident[]
  raw: EdnMap
}

export interface Library {
  version: string
  classes: Map<Ident, ClassDef>
  properties: Map<Ident, PropertyDef>
}

export interface Preset {
  id: string
  name: string
  description: string
  classes: Map<Ident, Ident[]>
}
