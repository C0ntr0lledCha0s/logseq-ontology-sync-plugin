/** A library class offered by the add-class combobox. */
export interface ClassOption {
  ident: string
  title: string
  /** Title of the first parent class, when the class extends one. */
  parentTitle: string | null
}

export interface ClassMatch extends ClassOption {
  /** Already part of the open role. */
  selected: boolean
}

/**
 * Filters and orders classes for the add-class combobox: case-insensitive substring match on the
 * title, prefix matches first, then the rest, each group alphabetical. An empty query matches all.
 */
export function matchClasses(
  classes: readonly ClassOption[],
  query: string,
  selected: ReadonlySet<string>
): ClassMatch[] {
  const q = query.trim().toLowerCase()
  const byTitle = (a: ClassOption, b: ClassOption): number =>
    a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })
  const prefix: ClassOption[] = []
  const rest: ClassOption[] = []
  for (const c of classes) {
    const title = c.title.toLowerCase()
    if (q === '' || title.startsWith(q)) prefix.push(c)
    else if (title.includes(q)) rest.push(c)
  }
  return [...prefix.sort(byTitle), ...rest.sort(byTitle)].map((c) => ({
    ...c,
    selected: selected.has(c.ident),
  }))
}
