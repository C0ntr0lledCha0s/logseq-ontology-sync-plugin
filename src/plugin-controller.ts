/**
 * Plugin Controller
 *
 * Coordinates all plugin modules and provides a unified interface
 * for handling user commands and plugin operations.
 */

import { OntologyImporter } from './import'
import { SyncEngine } from './sync'
import { SourceRegistry, SourceFetcher } from './sources'
import { LogseqOntologyAPI } from './api'
import {
  pickFile,
  showMessage,
  showConfirm,
  promptImportSourceType,
  promptForUrl,
  isValidUrl,
} from './ui/components'
import { logger } from './utils/logger'

/**
 * Plugin Controller class
 *
 * Orchestrates the interaction between different plugin modules:
 * - Import: For importing ontology templates
 * - Sync: For synchronizing with remote sources
 * - Sources: For managing template sources
 * - API: For interacting with Logseq
 */
export class PluginController {
  private importer: OntologyImporter
  private syncEngine: SyncEngine
  private sourceRegistry: SourceRegistry
  private sourceFetcher: SourceFetcher
  private api: LogseqOntologyAPI

  constructor() {
    this.api = new LogseqOntologyAPI()
    this.importer = new OntologyImporter()
    this.syncEngine = new SyncEngine()
    this.sourceRegistry = new SourceRegistry()
    this.sourceFetcher = new SourceFetcher()

    logger.info('PluginController initialized')
  }

  /**
   * Handle the import command
   * Opens a file picker and imports the selected template
   */
  async handleImport(): Promise<void> {
    try {
      // Pick file using browser file picker
      const file = await pickFile('.edn')
      if (!file) {
        logger.debug('Import cancelled - no file selected')
        return
      }

      const content = await file.text()
      logger.info('File selected for import', { name: file.name, size: content.length })

      // Generate preview
      await showMessage('Parsing template...', 'info')
      const preview = await this.importer.preview(content)

      // Build summary message
      const summary = this.buildImportSummary(preview)

      // Check for conflicts
      if (preview.conflicts.length > 0) {
        const conflictMsg = `\n\nWarning: ${preview.conflicts.length} conflict(s) detected.`
        const confirmed = showConfirm(summary + conflictMsg + '\n\nProceed with import?')
        if (!confirmed) {
          await showMessage('Import cancelled', 'info')
          return
        }
      } else if (preview.summary.totalNew > 0 || preview.summary.totalUpdated > 0) {
        const confirmed = showConfirm(summary + '\n\nProceed with import?')
        if (!confirmed) {
          await showMessage('Import cancelled', 'info')
          return
        }
      } else {
        await showMessage('No changes to import - ontology is already up to date', 'info')
        return
      }

      // Execute import
      await showMessage('Importing...', 'info')
      const result = await this.importer.import(content)

      if (result.success) {
        await showMessage(
          `Successfully imported ${result.applied.classes} classes and ${result.applied.properties} properties`,
          'success'
        )
      } else {
        const errorMsg = result.errors.map((e) => e.message).join(', ')
        await showMessage(`Import failed: ${errorMsg}`, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Import failed', error)
      await showMessage(`Import failed: ${message}`, 'error')
    }
  }

  /**
   * Handle import from URL or file
   * Prompts user to choose source type and imports accordingly
   */
  async handleImportFromSource(): Promise<void> {
    try {
      // Ask user for source type
      const sourceType = promptImportSourceType()

      if (sourceType === 'url') {
        await this.importFromUrl()
      } else {
        // sourceType === 'file'
        await this.handleImport()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Import from source failed', error)
      await showMessage(`Import failed: ${message}`, 'error')
    }
  }

  /**
   * Import ontology from a URL
   */
  private async importFromUrl(): Promise<void> {
    // Prompt for URL
    const url = promptForUrl(
      'Enter the URL to the .edn file:\n\n' +
        'Supported formats:\n' +
        '• Direct link to .edn file\n' +
        '• GitHub raw file URL\n' +
        '• GitHub release asset URL'
    )

    if (!url) {
      logger.debug('Import from URL cancelled - no URL entered')
      return
    }

    // Validate URL
    if (!isValidUrl(url)) {
      await showMessage('Invalid URL. Please enter a valid HTTP or HTTPS URL.', 'error')
      return
    }

    logger.info('Importing from URL', { url })
    await showMessage('Fetching template from URL...', 'info')

    // Fetch content from URL
    const fetchResult = await this.sourceFetcher.fetchUrl(url)

    if (!fetchResult || fetchResult.trim().length === 0) {
      await showMessage('The URL returned empty content', 'error')
      return
    }

    logger.info('URL fetched successfully', { url, size: fetchResult.length })

    // Generate preview
    await showMessage('Parsing template...', 'info')
    const preview = await this.importer.preview(fetchResult)

    // Build summary message
    const summary = this.buildImportSummary(preview)

    // Check for conflicts
    if (preview.conflicts.length > 0) {
      const conflictMsg = `\n\nWarning: ${preview.conflicts.length} conflict(s) detected.`
      const confirmed = showConfirm(summary + conflictMsg + '\n\nProceed with import?')
      if (!confirmed) {
        await showMessage('Import cancelled', 'info')
        return
      }
    } else if (preview.summary.totalNew > 0 || preview.summary.totalUpdated > 0) {
      const confirmed = showConfirm(summary + '\n\nProceed with import?')
      if (!confirmed) {
        await showMessage('Import cancelled', 'info')
        return
      }
    } else {
      await showMessage('No changes to import - ontology is already up to date', 'info')
      return
    }

    // Execute import
    await showMessage('Importing...', 'info')
    const result = await this.importer.import(fetchResult)

    if (result.success) {
      await showMessage(
        `Successfully imported ${result.applied.classes} classes and ${result.applied.properties} properties from URL`,
        'success'
      )
    } else {
      const errorMsg = result.errors.map((e) => e.message).join(', ')
      await showMessage(`Import failed: ${errorMsg}`, 'error')
    }
  }

  /**
   * Build a summary message for the import preview
   */
  private buildImportSummary(preview: {
    summary: { totalNew: number; totalUpdated: number; totalConflicts: number }
  }): string {
    const parts: string[] = ['Import Preview:']

    if (preview.summary.totalNew > 0) {
      parts.push(`  - ${preview.summary.totalNew} new items to add`)
    }
    if (preview.summary.totalUpdated > 0) {
      parts.push(`  - ${preview.summary.totalUpdated} items to update`)
    }
    if (preview.summary.totalConflicts > 0) {
      parts.push(`  - ${preview.summary.totalConflicts} conflicts`)
    }

    return parts.join('\n')
  }

  /**
   * Handle the export command
   */
  async handleExport(): Promise<void> {
    try {
      // Get existing ontology from graph
      const [properties, classes] = await Promise.all([
        this.api.getExistingProperties(),
        this.api.getExistingClasses(),
      ])

      if (properties.size === 0 && classes.size === 0) {
        await showMessage('No ontology found in current graph', 'warning')
        return
      }

      // For now, just show info about what would be exported
      await showMessage(
        `Found ${classes.size} classes and ${properties.size} properties. ` +
          `Full export functionality coming soon!`,
        'info'
      )

      // TODO: Implement full export
      // - Convert to EDN format
      // - Trigger file download
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Export failed', error)
      await showMessage(`Export failed: ${message}`, 'error')
    }
  }

  /**
   * Handle the sync command
   */
  async handleSync(): Promise<void> {
    try {
      // Get configured sources
      const sources = await this.sourceRegistry.getAllSources()
      const enabledSources = sources.filter((s) => s.enabled)

      if (enabledSources.length === 0) {
        await showMessage(
          'No sync sources configured. Use "Manage Sources" to add sources.',
          'info'
        )
        return
      }

      await showMessage(`Checking ${enabledSources.length} source(s) for updates...`, 'info')

      // Check for updates from all sources
      let hasUpdates = false
      for (const source of enabledSources) {
        try {
          const result = await this.syncEngine.checkForUpdates(source.id)
          if (result.hasUpdates) {
            hasUpdates = true
            await showMessage(`Updates available from: ${source.name}`, 'info')
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error'
          logger.warn(`Failed to check source: ${source.name}`, { error: msg })
        }
      }

      if (!hasUpdates) {
        await showMessage('All sources are up to date', 'success')
      }

      // TODO: Implement full sync workflow
      // - Show preview of changes
      // - Apply updates with user confirmation
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Sync failed', error)
      await showMessage(`Sync failed: ${message}`, 'error')
    }
  }

  /**
   * Handle the manage sources command
   */
  async handleManageSources(): Promise<void> {
    try {
      // Get current sources
      const sources = await this.sourceRegistry.getAllSources()

      if (sources.length === 0) {
        await showMessage(
          'No sources configured.\n\n' +
            'To add sources, you can:\n' +
            '1. Use the import command to import a local file\n' +
            '2. Configure sources in plugin settings (coming soon)',
          'info'
        )
      } else {
        // Show summary of configured sources
        const enabledCount = sources.filter((s) => s.enabled).length
        await showMessage(
          `${sources.length} source(s) configured (${enabledCount} enabled).\n\n` +
            `Source management UI coming soon!`,
          'info'
        )
      }

      // TODO: Implement source management UI
      // - List sources with status
      // - Add/remove sources
      // - Enable/disable sources
      // - Configure sync settings
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Source management failed', error)
      await showMessage(`Failed to load sources: ${message}`, 'error')
    }
  }
}
