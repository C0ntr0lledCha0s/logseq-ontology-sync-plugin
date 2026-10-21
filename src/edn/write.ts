import { isKw, isUuid, type EdnValue } from './value'

function writeString(s: string): string {
  return (
    '"' +
    s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t') +
    '"'
  )
}

export function writeEdn(v: EdnValue): string {
  if (v === null) return 'nil'
  if (typeof v === 'string') return writeString(v)
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Cannot write non-finite number: ' + v)
    return String(v)
  }
  if (Array.isArray(v)) return '[' + v.map(writeEdn).join(' ') + ']'
  if (v instanceof Map) {
    const parts: string[] = []
    for (const [k, val] of v) parts.push(writeEdn(k) + ' ' + writeEdn(val))
    return '{' + parts.join(' ') + '}'
  }
  if (isKw(v)) return ':' + v.kw
  if (isUuid(v)) return '#uuid ' + writeString(v.uuid)
  throw new Error('Cannot write EDN value: ' + String(v))
}
