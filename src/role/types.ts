import type { Ident } from '../library/types'

export type Source = { kind: 'preset'; id: string } | { kind: 'user' } | { kind: 'parent' }

export type Override = 'on' | 'off'

export interface RoleDefinition {
  name: string
  libraryVersion: string
  presets: string[]
  classOverrides: Record<Ident, Override>
  /** Keys are `${classIdent}|${propIdent}`. */
  propertyOverrides: Record<string, Override>
}

export interface PropertySelection {
  ident: Ident
  on: boolean
  sources: Source[]
  userOverride?: Override
}

export interface ClassSelection {
  ident: Ident
  on: boolean
  sources: Source[]
  userOverride?: Override
  /** Every direct property of the class, in library order, including ones that are off. */
  properties: PropertySelection[]
}

export interface Selection {
  classes: Map<Ident, ClassSelection>
  missing: Ident[]
}
