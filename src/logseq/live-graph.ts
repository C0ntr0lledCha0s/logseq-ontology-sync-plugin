import type { Ident } from '../library/types'
import type { LogseqLike } from './types'

const QUERY =
  '[:find ?ident ?type ?card :where [?p :db/ident ?ident] [?p :logseq.property/type ?type] [?p :db/cardinality ?card]]'

/**
 * Logseq's plugin API serialises keywords with a leading colon unless the namespace is exactly
 * block/db/file (`logseq.sdk.utils/normalize-keyword-for-json`): idents arrive as
 * ":schema.property/email", cardinality as ":db.cardinality/many" (namespace db.cardinality is
 * not in the bare list) and the type as bare "default".
 */
const stripColon = (kw: string): string => (kw.startsWith(':') ? kw.slice(1) : kw)

/** Type and cardinality of every `schema.*` / `custom.*` property currently in the graph. */
export async function readLivePropertySchemas(
  api: LogseqLike
): Promise<Map<Ident, { type: string; cardinality: 'one' | 'many' }>> {
  const rows = await api.DB.datascriptQuery<unknown[]>(QUERY)
  const out = new Map<Ident, { type: string; cardinality: 'one' | 'many' }>()
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 3 || !row.every((v) => typeof v === 'string')) {
      throw new Error(`Unexpected live property row: ${JSON.stringify(row)}`)
    }
    const [rawIdent, type, rawCard] = row as [string, string, string]
    const ident = stripColon(rawIdent)
    const card = stripColon(rawCard)
    if (card !== 'db.cardinality/one' && card !== 'db.cardinality/many') {
      throw new Error(`Unexpected cardinality ${JSON.stringify(rawCard)} for ${ident}`)
    }
    if (!ident.startsWith('schema.') && !ident.startsWith('custom.')) continue
    out.set(ident, { type, cardinality: card === 'db.cardinality/many' ? 'many' : 'one' })
  }
  return out
}
