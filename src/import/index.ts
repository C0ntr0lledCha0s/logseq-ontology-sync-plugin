/**
 * Import module exports
 */

export { OntologyImporter } from './importer'
export { diffTemplate, createEmptyOntology } from './diff'
export type {
  ImportOptions,
  ImportProgress,
  ImportResult,
  ImportPreview,
  ImportError,
  ParsedTemplate,
  ExistingOntology,
  ClassDefinition,
  PropertyDefinition,
  ClassUpdate,
  PropertyUpdate,
  Conflict,
} from './types'
