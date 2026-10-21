import type { Ident } from '../library/types'
import type { LogseqLike } from './types'

const QUERY =
  '[:find ?ident ?type ?card :where [?p :db/ident ?ident] [?p :logseq.property/type ?type] [?p :db/cardinality ?card]]'

/** Type and cardinality of every `schema.*` / `custom.*` property currently in the graph. */
export async function readLivePropertySchemas(
  api: LogseqLike
): Promise<Map<Ident, { type: string; cardinality: 'one' | 'many' }>> {
  const rows = await api.DB.datascriptQuery<[string, string, string][]>(QUERY)
  const out = new Map<Ident, { type: string; cardinality: 'one' | 'many' }>()
  for (const [ident, type, card] of rows) {
    if (!ident.startsWith('schema.') && !ident.startsWith('custom.')) continue
    out.set(ident, { type, cardinality: card === 'db.cardinality/many' ? 'many' : 'one' })
  }
  return out
}
