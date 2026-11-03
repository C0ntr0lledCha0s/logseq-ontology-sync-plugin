import { parseEDNString } from 'edn-data'
import { kw, type EdnMap, type EdnValue } from './value'

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function convert(raw: unknown): EdnValue {
  if (raw === null || typeof raw === 'string' || typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw
  if (Array.isArray(raw)) return raw.map(convert)
  if (raw instanceof Date) throw new Error('Unsupported EDN tag: inst')
  if (isObj(raw)) {
    if (typeof raw.key === 'string') return kw(raw.key)
    if (Array.isArray(raw.map)) {
      const m: EdnMap = new Map()
      for (const entry of raw.map as unknown[][]) m.set(convert(entry[0]), convert(entry[1]))
      return m
    }
    if (Array.isArray(raw.list)) return raw.list.map(convert)
    if (typeof raw.tag === 'string') {
      if (raw.tag === 'uuid' && typeof raw.val === 'string') return { uuid: raw.val }
      throw new Error('Unsupported EDN tag: ' + raw.tag)
    }
  }
  throw new Error('Unsupported EDN value: ' + JSON.stringify(raw))
}

export function readEdn(text: string): EdnValue {
  return convert(parseEDNString(text))
}
