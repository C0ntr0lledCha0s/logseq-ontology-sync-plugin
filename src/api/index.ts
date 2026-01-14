/**
 * API module exports
 */

export { LogseqOntologyAPI } from './ontology-api'
export {
  executeQuery,
  buildFilterQuery,
  QUERY_ALL_PROPERTIES,
  QUERY_ALL_CLASSES,
  QUERY_PROPERTY_BY_NAME,
  QUERY_CLASS_BY_NAME,
  QUERY_CLASS_PROPERTIES,
  QUERY_PROPERTY_USAGE,
} from './queries'
export * from './logseq-api'
export type {
  PropertyValueType,
  PropertyCardinality,
  PropertyDefinition,
  PropertyEntity,
  ClassDefinition,
  ClassEntity,
  Transaction,
  TransactionOperation,
  TransactionStatus,
  APIError,
  ProgressCallback,
  ProgressInfo,
  BatchResult,
  BatchError,
} from './types'
