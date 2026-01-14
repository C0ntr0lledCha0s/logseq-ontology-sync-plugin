/**
 * Datascript query helpers for Logseq
 */

import { logger } from '../utils/logger'

/**
 * Query to find all property pages
 */
export const QUERY_ALL_PROPERTIES = `
  [:find (pull ?p [*])
   :where
   [?p :block/type "property"]]
`

/**
 * Query to find all class pages
 */
export const QUERY_ALL_CLASSES = `
  [:find (pull ?c [*])
   :where
   [?c :block/type "class"]]
`

/**
 * Query to find a property by name
 */
export const QUERY_PROPERTY_BY_NAME = `
  [:find (pull ?p [*])
   :in $ ?name
   :where
   [?p :block/type "property"]
   [?p :block/name ?name]]
`

/**
 * Query to find a class by name
 */
export const QUERY_CLASS_BY_NAME = `
  [:find (pull ?c [*])
   :in $ ?name
   :where
   [?c :block/type "class"]
   [?c :block/name ?name]]
`

/**
 * Query to find properties of a class
 */
export const QUERY_CLASS_PROPERTIES = `
  [:find (pull ?prop [*])
   :in $ ?class-name
   :where
   [?c :block/name ?class-name]
   [?c :block/type "class"]
   [?c :class/properties ?prop]]
`

/**
 * Query to find classes using a property
 */
export const QUERY_PROPERTY_USAGE = `
  [:find (pull ?c [:block/name :block/uuid])
   :in $ ?prop-name
   :where
   [?p :block/name ?prop-name]
   [?p :block/type "property"]
   [?c :class/properties ?p]]
`

/**
 * Execute a datascript query against Logseq
 * @param query - The datascript query string
 * @param inputs - Optional query inputs
 * @returns Query results
 */
export async function executeQuery<T>(query: string, ...inputs: unknown[]): Promise<T[]> {
  try {
    logger.debug('Executing datascript query', { query: query.substring(0, 100), inputCount: inputs.length })

    // Call the Logseq datascript query API
    const results = await logseq.DB.datascriptQuery(query, ...inputs)

    if (!results || !Array.isArray(results)) {
      logger.debug('Query returned no results')
      return []
    }

    // Datascript returns nested arrays: [[entity1], [entity2], ...]
    // We extract the first element from each row
    const entities = results.map((row: unknown[]) => row[0] as T)

    logger.debug('Query executed successfully', { resultCount: entities.length })
    return entities
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed'
    logger.error('Datascript query failed', error)
    throw new Error(`Datascript query failed: ${message}`)
  }
}

/**
 * Build a dynamic query for filtering entities
 */
export function buildFilterQuery(
  entityType: 'property' | 'class',
  filters: Record<string, unknown>
): string {
  const whereClauses = [`[?e :block/type "${entityType}"]`]

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined) {
      whereClauses.push(`[?e :block/${key} "${value}"]`)
    }
  }

  return `
    [:find (pull ?e [*])
     :where
     ${whereClauses.join('\n     ')}]
  `
}
