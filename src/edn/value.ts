export type EdnKeyword = { readonly kw: string }
export type EdnUuid = { readonly uuid: string }
export type EdnMap = Map<EdnValue, EdnValue>
export type EdnValue = string | number | boolean | null | EdnKeyword | EdnUuid | EdnValue[] | EdnMap

const keywords = new Map<string, EdnKeyword>()

/** Interned keyword: `kw('a') === kw('a')`. Name has no leading colon. */
export function kw(name: string): EdnKeyword {
  let k = keywords.get(name)
  if (!k) {
    k = Object.freeze({ kw: name })
    keywords.set(name, k)
  }
  return k
}

export function isKw(v: unknown, name?: string): v is EdnKeyword {
  return (
    typeof v === 'object' &&
    v !== null &&
    'kw' in v &&
    (name === undefined || (v as EdnKeyword).kw === name)
  )
}

export function isUuid(v: unknown): v is EdnUuid {
  return typeof v === 'object' && v !== null && 'uuid' in v
}

export function isMap(v: unknown): v is EdnMap {
  return v instanceof Map
}

/** Look up a keyword-keyed entry; `key` is a keyword name. */
export function mapGet(m: EdnMap, key: string): EdnValue | undefined {
  return m.get(kw(key))
}
