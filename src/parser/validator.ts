/**
 * Validator module for parsed EDN templates
 * Provides comprehensive validation for Logseq ontology structures
 */

import {
  type ParsedTemplate,
  type PropertyDefinition,
  type ClassDefinition,
  type ValidationResult,
  type ValidationIssue,
  type ValidationStats,
  type ValidationSeverity,
  type UUID,
  UUID_REGEX,
  isUUID,
} from './types'

/**
 * Validation options
 */
export interface ValidatorOptions {
  /** Whether to validate UUIDs strictly */
  strictUuidValidation?: boolean
  /** Whether to check for orphaned references */
  checkOrphanedReferences?: boolean
  /** Maximum allowed properties */
  maxProperties?: number
  /** Maximum allowed classes */
  maxClasses?: number
  /** Custom validation rules */
  customRules?: ValidationRule[]
}

/**
 * Custom validation rule definition
 */
export interface ValidationRule {
  name: string
  validate: (template: ParsedTemplate) => ValidationIssue[]
}

/**
 * Default validator options
 */
const DEFAULT_OPTIONS: ValidatorOptions = {
  strictUuidValidation: true,
  checkOrphanedReferences: true,
  maxProperties: 10000,
  maxClasses: 10000,
}

/**
 * Template validator class
 */
export class TemplateValidator {
  private options: ValidatorOptions

  constructor(options: ValidatorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * Validate a parsed template
   */
  validate(template: ParsedTemplate): ValidationResult {
    const issues: ValidationIssue[] = []

    // Collect all validation issues
    issues.push(...this.validateStructure(template))
    issues.push(...this.validateProperties(template))
    issues.push(...this.validateClasses(template))
    issues.push(...this.validateReferences(template))

    // Run custom rules
    if (this.options.customRules) {
      for (const rule of this.options.customRules) {
        issues.push(...rule.validate(template))
      }
    }

    // Calculate stats
    const stats = this.calculateStats(template, issues)

    return {
      valid: stats.errorCount === 0,
      issues,
      stats,
    }
  }

  /**
   * Validate basic template structure
   */
  private validateStructure(template: ParsedTemplate): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    // Check export type
    if (!template.exportType) {
      issues.push(this.createIssue('error', 'MISSING_EXPORT_TYPE', 'Template must have an export type', 'exportType'))
    }

    // Check properties map
    if (!(template.properties instanceof Map)) {
      issues.push(
        this.createIssue('error', 'INVALID_PROPERTIES', 'Properties must be a Map', 'properties')
      )
    }

    // Check classes map
    if (!(template.classes instanceof Map)) {
      issues.push(this.createIssue('error', 'INVALID_CLASSES', 'Classes must be a Map', 'classes'))
    }

    // Check limits
    if (this.options.maxProperties && template.properties.size > this.options.maxProperties) {
      issues.push(
        this.createIssue(
          'warning',
          'TOO_MANY_PROPERTIES',
          `Template has ${template.properties.size} properties, exceeding limit of ${this.options.maxProperties}`,
          'properties'
        )
      )
    }

    if (this.options.maxClasses && template.classes.size > this.options.maxClasses) {
      issues.push(
        this.createIssue(
          'warning',
          'TOO_MANY_CLASSES',
          `Template has ${template.classes.size} classes, exceeding limit of ${this.options.maxClasses}`,
          'classes'
        )
      )
    }

    return issues
  }

  /**
   * Validate all properties
   */
  private validateProperties(template: ParsedTemplate): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const seenIds = new Set<string>()

    for (const [key, prop] of template.properties) {
      const path = `properties.${key}`

      // Validate property has required fields
      issues.push(...this.validatePropertyDefinition(prop, path))

      // Check for duplicate IDs
      if (prop.id && isUUID(prop.id)) {
        if (seenIds.has(prop.id.uuid)) {
          issues.push(
            this.createIssue('error', 'DUPLICATE_PROPERTY_ID', `Duplicate property ID: ${prop.id.uuid}`, `${path}.id`)
          )
        } else {
          seenIds.add(prop.id.uuid)
        }
      }
    }

    return issues
  }

  /**
   * Validate a single property definition
   */
  private validatePropertyDefinition(prop: PropertyDefinition, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    // Required: id
    if (!prop.id) {
      issues.push(this.createIssue('error', 'MISSING_PROPERTY_ID', 'Property must have an id', `${path}.id`))
    } else if (this.options.strictUuidValidation) {
      issues.push(...this.validateUuid(prop.id, `${path}.id`))
    }

    // Required: name
    if (!prop.name || typeof prop.name !== 'string') {
      issues.push(
        this.createIssue('error', 'MISSING_PROPERTY_NAME', 'Property must have a name', `${path}.name`)
      )
    } else if (prop.name.trim() === '') {
      issues.push(
        this.createIssue('warning', 'EMPTY_PROPERTY_NAME', 'Property name should not be empty', `${path}.name`)
      )
    }

    // Required: type
    const validTypes = ['default', 'number', 'date', 'datetime', 'checkbox', 'url', 'page', 'node']
    if (!prop.type) {
      issues.push(
        this.createIssue(
          'warning',
          'MISSING_PROPERTY_TYPE',
          'Property type not specified, defaulting to "default"',
          `${path}.type`
        )
      )
    } else if (!validTypes.includes(prop.type)) {
      issues.push(
        this.createIssue(
          'error',
          'INVALID_PROPERTY_TYPE',
          `Invalid property type: ${prop.type}. Must be one of: ${validTypes.join(', ')}`,
          `${path}.type`
        )
      )
    }

    // Required: cardinality
    const validCardinalities = ['one', 'many']
    if (!prop.cardinality) {
      issues.push(
        this.createIssue(
          'warning',
          'MISSING_CARDINALITY',
          'Property cardinality not specified, defaulting to "one"',
          `${path}.cardinality`
        )
      )
    } else if (!validCardinalities.includes(prop.cardinality)) {
      issues.push(
        this.createIssue(
          'error',
          'INVALID_CARDINALITY',
          `Invalid cardinality: ${prop.cardinality}. Must be one of: ${validCardinalities.join(', ')}`,
          `${path}.cardinality`
        )
      )
    }

    // Validate closed values if property is closed
    if (prop.closed && prop.closedValues) {
      for (let i = 0; i < prop.closedValues.length; i++) {
        const cv = prop.closedValues[i]
        const cvPath = `${path}.closedValues[${i}]`

        if (!cv.id) {
          issues.push(this.createIssue('error', 'MISSING_CLOSED_VALUE_ID', 'Closed value must have an id', `${cvPath}.id`))
        } else if (this.options.strictUuidValidation) {
          issues.push(...this.validateUuid(cv.id, `${cvPath}.id`))
        }

        if (!cv.value || typeof cv.value !== 'string') {
          issues.push(
            this.createIssue('error', 'MISSING_CLOSED_VALUE', 'Closed value must have a value', `${cvPath}.value`)
          )
        }
      }
    }

    // Validate classes references for node type
    if (prop.type === 'node' && prop.classes) {
      for (let i = 0; i < prop.classes.length; i++) {
        if (this.options.strictUuidValidation) {
          issues.push(...this.validateUuid(prop.classes[i], `${path}.classes[${i}]`))
        }
      }
    }

    return issues
  }

  /**
   * Validate all classes
   */
  private validateClasses(template: ParsedTemplate): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    const seenIds = new Set<string>()

    for (const [key, cls] of template.classes) {
      const path = `classes.${key}`

      // Validate class has required fields
      issues.push(...this.validateClassDefinition(cls, path))

      // Check for duplicate IDs
      if (cls.id && isUUID(cls.id)) {
        if (seenIds.has(cls.id.uuid)) {
          issues.push(this.createIssue('error', 'DUPLICATE_CLASS_ID', `Duplicate class ID: ${cls.id.uuid}`, `${path}.id`))
        } else {
          seenIds.add(cls.id.uuid)
        }
      }
    }

    return issues
  }

  /**
   * Validate a single class definition
   */
  private validateClassDefinition(cls: ClassDefinition, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    // Required: id
    if (!cls.id) {
      issues.push(this.createIssue('error', 'MISSING_CLASS_ID', 'Class must have an id', `${path}.id`))
    } else if (this.options.strictUuidValidation) {
      issues.push(...this.validateUuid(cls.id, `${path}.id`))
    }

    // Required: name
    if (!cls.name || typeof cls.name !== 'string') {
      issues.push(this.createIssue('error', 'MISSING_CLASS_NAME', 'Class must have a name', `${path}.name`))
    } else if (cls.name.trim() === '') {
      issues.push(
        this.createIssue('warning', 'EMPTY_CLASS_NAME', 'Class name should not be empty', `${path}.name`)
      )
    }

    // Validate parent references
    if (cls.parents) {
      for (let i = 0; i < cls.parents.length; i++) {
        if (this.options.strictUuidValidation) {
          issues.push(...this.validateUuid(cls.parents[i], `${path}.parents[${i}]`))
        }
      }
    }

    // Validate property references
    if (cls.properties) {
      for (let i = 0; i < cls.properties.length; i++) {
        if (this.options.strictUuidValidation) {
          issues.push(...this.validateUuid(cls.properties[i], `${path}.properties[${i}]`))
        }
      }
    }

    return issues
  }

  /**
   * Validate references between entities
   */
  private validateReferences(template: ParsedTemplate): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (!this.options.checkOrphanedReferences) {
      return issues
    }

    // Collect all known IDs
    const propertyIds = new Set<string>()
    const classIds = new Set<string>()

    for (const prop of template.properties.values()) {
      if (prop.id && isUUID(prop.id)) {
        propertyIds.add(prop.id.uuid)
      }
    }

    for (const cls of template.classes.values()) {
      if (cls.id && isUUID(cls.id)) {
        classIds.add(cls.id.uuid)
      }
    }

    // Check class property references
    for (const [key, cls] of template.classes) {
      if (cls.properties) {
        for (const propId of cls.properties) {
          if (isUUID(propId) && !propertyIds.has(propId.uuid)) {
            issues.push(
              this.createIssue(
                'warning',
                'ORPHANED_PROPERTY_REFERENCE',
                `Class "${cls.name}" references unknown property: ${propId.uuid}`,
                `classes.${key}.properties`
              )
            )
          }
        }
      }

      // Check parent references
      if (cls.parents) {
        for (const parentId of cls.parents) {
          if (isUUID(parentId) && !classIds.has(parentId.uuid)) {
            issues.push(
              this.createIssue(
                'warning',
                'ORPHANED_PARENT_REFERENCE',
                `Class "${cls.name}" references unknown parent class: ${parentId.uuid}`,
                `classes.${key}.parents`
              )
            )
          }
        }
      }
    }

    // Check property class references
    for (const [key, prop] of template.properties) {
      if (prop.type === 'node' && prop.classes) {
        for (const clsId of prop.classes) {
          if (isUUID(clsId) && !classIds.has(clsId.uuid)) {
            issues.push(
              this.createIssue(
                'warning',
                'ORPHANED_CLASS_REFERENCE',
                `Property "${prop.name}" references unknown class: ${clsId.uuid}`,
                `properties.${key}.classes`
              )
            )
          }
        }
      }
    }

    return issues
  }

  /**
   * Validate a UUID value
   */
  private validateUuid(uuid: UUID | undefined, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    if (!uuid) {
      issues.push(this.createIssue('error', 'MISSING_UUID', 'UUID is required', path))
      return issues
    }

    if (!isUUID(uuid)) {
      issues.push(this.createIssue('error', 'INVALID_UUID_FORMAT', 'Value is not a valid UUID object', path))
      return issues
    }

    if (!UUID_REGEX.test(uuid.uuid)) {
      issues.push(
        this.createIssue(
          'error',
          'INVALID_UUID_VALUE',
          `Invalid UUID format: ${uuid.uuid}`,
          path,
          'UUID must be in format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
        )
      )
    }

    return issues
  }

  /**
   * Calculate validation statistics
   */
  private calculateStats(template: ParsedTemplate, issues: ValidationIssue[]): ValidationStats {
    return {
      totalProperties: template.properties.size,
      totalClasses: template.classes.size,
      totalPages: template.pages?.length ?? 0,
      totalBlocks: template.blocks?.length ?? 0,
      errorCount: issues.filter((i) => i.severity === 'error').length,
      warningCount: issues.filter((i) => i.severity === 'warning').length,
      infoCount: issues.filter((i) => i.severity === 'info').length,
    }
  }

  /**
   * Create a validation issue
   */
  private createIssue(
    severity: ValidationSeverity,
    code: string,
    message: string,
    path?: string,
    suggestion?: string
  ): ValidationIssue {
    return { severity, code, message, path, suggestion }
  }
}

/**
 * Quick validation function
 */
export function validateTemplate(
  template: ParsedTemplate,
  options?: ValidatorOptions
): ValidationResult {
  const validator = new TemplateValidator(options)
  return validator.validate(template)
}

/**
 * Check if validation result has errors
 */
export function hasErrors(result: ValidationResult): boolean {
  return result.stats.errorCount > 0
}

/**
 * Check if validation result has warnings
 */
export function hasWarnings(result: ValidationResult): boolean {
  return result.stats.warningCount > 0
}

/**
 * Format validation issues as human-readable string
 */
export function formatValidationIssues(result: ValidationResult): string {
  if (result.issues.length === 0) {
    return 'No issues found.'
  }

  const lines: string[] = []

  for (const issue of result.issues) {
    const prefix =
      issue.severity === 'error' ? '[ERROR]' : issue.severity === 'warning' ? '[WARN]' : '[INFO]'

    let line = `${prefix} ${issue.code}: ${issue.message}`
    if (issue.path) {
      line += ` (at ${issue.path})`
    }
    if (issue.line !== undefined) {
      line += ` [line ${issue.line}]`
    }
    lines.push(line)

    if (issue.suggestion) {
      lines.push(`  Suggestion: ${issue.suggestion}`)
    }
  }

  lines.push('')
  lines.push(`Summary: ${result.stats.errorCount} errors, ${result.stats.warningCount} warnings, ${result.stats.infoCount} info`)

  return lines.join('\n')
}
