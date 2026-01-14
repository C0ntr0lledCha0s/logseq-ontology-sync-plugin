/**
 * Ontology Importer module
 * Coordinates the import workflow for ontology templates
 */

import { parseEdn, validateEdnTemplate } from '../parser/edn-parser'
import { logger } from '../utils/logger'
import { diffTemplate, createEmptyOntology } from './diff'
import type {
  ImportOptions,
  ImportProgress,
  ImportResult,
  ImportPreview,
  ImportError,
  ParsedTemplate,
  ExistingOntology,
  ClassDefinition,
  PropertyDefinition,
} from './types'

/**
 * Default import options
 */
const defaultOptions: Required<ImportOptions> = {
  dryRun: false,
  onProgress: () => {},
  conflictStrategy: 'ask',
  validate: true,
}

/**
 * Convert parsed EDN to ParsedTemplate structure
 */
function ednToParsedTemplate(data: Record<string, unknown>): ParsedTemplate {
  const classes: ClassDefinition[] = []
  const properties: PropertyDefinition[] = []

  // Extract classes
  if (Array.isArray(data['classes'])) {
    for (const cls of data['classes']) {
      if (typeof cls === 'object' && cls !== null) {
        const c = cls as Record<string, unknown>
        classes.push({
          name: String(c['name'] || ''),
          namespace: c['namespace'] ? String(c['namespace']) : undefined,
          parent: c['parent'] ? String(c['parent']) : undefined,
          description: c['description'] ? String(c['description']) : undefined,
          properties: Array.isArray(c['properties'])
            ? c['properties'].map(String)
            : undefined,
        })
      }
    }
  }

  // Extract properties
  if (Array.isArray(data['properties'])) {
    for (const prop of data['properties']) {
      if (typeof prop === 'object' && prop !== null) {
        const p = prop as Record<string, unknown>
        properties.push({
          name: String(p['name'] || ''),
          namespace: p['namespace'] ? String(p['namespace']) : undefined,
          type: String(p['type'] || 'default'),
          description: p['description'] ? String(p['description']) : undefined,
          cardinality: p['cardinality'] === 'many' ? 'many' : 'one',
          required: Boolean(p['required']),
        })
      }
    }
  }

  return {
    classes,
    properties,
    metadata: {
      name: data['name'] ? String(data['name']) : undefined,
      version: data['version'] ? String(data['version']) : undefined,
      description: data['description'] ? String(data['description']) : undefined,
    },
  }
}

/**
 * OntologyImporter class
 * Handles parsing, validation, comparison, and import of ontology templates
 */
export class OntologyImporter {
  private options: Required<ImportOptions>

  constructor(options?: ImportOptions) {
    this.options = { ...defaultOptions, ...options }
  }

  /**
   * Report progress to callback
   */
  private reportProgress(progress: ImportProgress): void {
    this.options.onProgress(progress)
  }

  /**
   * Parse EDN content into a template structure
   */
  private parseContent(content: string): ParsedTemplate {
    const data = parseEdn(content)
    return ednToParsedTemplate(data)
  }

  /**
   * Get existing ontology from Logseq graph
   * In a real implementation, this would query Logseq's database
   */
  private async getExistingOntology(): Promise<ExistingOntology> {
    // TODO: Implement actual Logseq query when API is available
    // For now, return empty ontology
    return createEmptyOntology()
  }

  /**
   * Apply changes to Logseq graph
   * In a real implementation, this would use the Logseq API
   */
  private async applyChanges(
    preview: ImportPreview
  ): Promise<{ classes: number; properties: number }> {
    // TODO: Implement actual Logseq API calls
    logger.info('Applying changes', {
      classes: preview.newClasses.length + preview.updatedClasses.length,
      properties: preview.newProperties.length + preview.updatedProperties.length,
    })

    return {
      classes: preview.newClasses.length + preview.updatedClasses.length,
      properties: preview.newProperties.length + preview.updatedProperties.length,
    }
  }

  /**
   * Generate a preview of changes without applying them
   */
  async preview(content: string): Promise<ImportPreview> {
    this.reportProgress({
      phase: 'parsing',
      current: 0,
      total: 3,
      message: 'Parsing template...',
    })

    const template = this.parseContent(content)

    this.reportProgress({
      phase: 'validating',
      current: 1,
      total: 3,
      message: 'Validating template...',
    })

    if (this.options.validate) {
      const validation = validateEdnTemplate(template as unknown as Record<string, unknown>)
      if (!validation) {
        throw new Error('Template validation failed')
      }
    }

    this.reportProgress({
      phase: 'comparing',
      current: 2,
      total: 3,
      message: 'Comparing with existing ontology...',
    })

    const existing = await this.getExistingOntology()
    const preview = diffTemplate(template, existing)

    this.reportProgress({
      phase: 'comparing',
      current: 3,
      total: 3,
      message: 'Preview complete',
    })

    return preview
  }

  /**
   * Import a template into Logseq
   */
  async import(content: string, options?: ImportOptions): Promise<ImportResult> {
    const startTime = Date.now()
    const opts = { ...this.options, ...options }
    const errors: ImportError[] = []

    try {
      // Generate preview first
      const preview = await this.preview(content)

      // Check for unresolved conflicts
      if (preview.conflicts.length > 0 && opts.conflictStrategy === 'ask') {
        return {
          success: false,
          preview,
          applied: { classes: 0, properties: 0 },
          errors: [
            {
              code: 'UNRESOLVED_CONFLICTS',
              message: `${preview.conflicts.length} conflict(s) require resolution`,
            },
          ],
          duration: Date.now() - startTime,
          dryRun: opts.dryRun,
        }
      }

      // If dry run, don't apply changes
      if (opts.dryRun) {
        return {
          success: true,
          preview,
          applied: { classes: 0, properties: 0 },
          errors: [],
          duration: Date.now() - startTime,
          dryRun: true,
        }
      }

      // Apply changes
      this.reportProgress({
        phase: 'importing',
        current: 0,
        total: 1,
        message: 'Applying changes...',
      })

      const applied = await this.applyChanges(preview)

      this.reportProgress({
        phase: 'importing',
        current: 1,
        total: 1,
        message: 'Import complete',
      })

      return {
        success: true,
        preview,
        applied,
        errors,
        duration: Date.now() - startTime,
        dryRun: false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      errors.push({
        code: 'IMPORT_FAILED',
        message,
      })

      return {
        success: false,
        preview: {
          newClasses: [],
          updatedClasses: [],
          newProperties: [],
          updatedProperties: [],
          conflicts: [],
          summary: { totalNew: 0, totalUpdated: 0, totalConflicts: 0 },
        },
        applied: { classes: 0, properties: 0 },
        errors,
        duration: Date.now() - startTime,
        dryRun: opts.dryRun,
      }
    }
  }
}
