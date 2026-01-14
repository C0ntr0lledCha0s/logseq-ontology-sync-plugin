/**
 * Parser module exports
 */

export { parseEdn, encodeEdn, validateEdnTemplate } from './edn-parser'
export type {
  UUID,
  PropertySchemaType,
  PropertyCardinality,
  PropertyDefinition,
  ClosedValue,
  ClassDefinition,
  PageReference,
  BlockDefinition,
  ParsedTemplate,
  ValidationSeverity,
  ValidationIssue,
  ValidationResult,
  ValidationStats,
  ParserOptions,
  ParseError,
  ValidationError,
  EdnData,
  isUUID,
  isEDNTaggedVal,
  isEDNKeyword,
  UUID_REGEX,
} from './types'
export {
  TemplateValidator,
  validateTemplate,
  hasErrors,
  hasWarnings,
  formatValidationIssues,
  type ValidatorOptions,
  type ValidationRule,
} from './validator'

/**
 * Factory function to create a validator instance
 */
export { TemplateValidator as createValidator } from './validator'
