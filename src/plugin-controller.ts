/**
 * Plugin Controller
 *
 * Coordinates all plugin modules and provides a unified interface
 * for handling user commands and plugin operations.
 */

import { OntologyImporter } from './import'
import { SyncEngine } from './sync'
import { SourceRegistry } from './sources'
import { LogseqOntologyAPI } from './api'
import {
  fetchMarketplaceTemplates,
  fetchTemplateContent,
  type MarketplaceTemplate,
} from './marketplace'
import { getMainPanelHTML, getMainPanelStyles } from './ui/main-panel'
import { pickFile, showMessage, showConfirm } from './ui/components'
import { getSettings } from './settings'
import { logger } from './utils/logger'

/**
 * Detect if Logseq is in dark mode
 */
async function isDarkMode(): Promise<boolean> {
  try {
    const configs = await logseq.App.getUserConfigs()
    // Theme can be 'light', 'dark', or a custom theme name
    const theme = configs.preferredThemeMode
    return theme === 'dark'
  } catch {
    // Default to light mode if detection fails
    return false
  }
}

/**
 * Refresh the Logseq UI to show newly created pages
 * Navigates to All Pages view to ensure new items are visible
 */
async function refreshLogseqUI(): Promise<void> {
  try {
    // Navigate to all-pages to show newly created pages/properties
    await logseq.App.pushState('all-pages')
    logger.debug('Navigated to all-pages to show new items')
  } catch (error) {
    logger.warn('Failed to refresh UI', error)
  }
}

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
  private api: LogseqOntologyAPI

  // UI state
  private templates: MarketplaceTemplate[] | null = null
  private isLoading = false
  private error: string | null = null

  constructor() {
    this.api = new LogseqOntologyAPI()
    this.importer = new OntologyImporter()
    this.syncEngine = new SyncEngine()
    this.sourceRegistry = new SourceRegistry()

    logger.info('PluginController initialized')
  }

  /**
   * Initialize the UI
   */
  initializeUI(): void {
    // Inject styles into plugin iframe
    const style = document.createElement('style')
    style.textContent = getMainPanelStyles()
    document.head.appendChild(style)

    // Set up the main UI container styles
    logseq.setMainUIInlineStyle({
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      zIndex: '999',
    })

    // Create container for panel
    const container = document.createElement('div')
    container.id = 'ontology-panel-root'
    document.body.appendChild(container)

    logger.info('UI initialized')
  }

  /**
   * Show the main panel
   */
  async showPanel(): Promise<void> {
    // Apply theme before showing
    const darkMode = await isDarkMode()
    document.body.setAttribute('data-theme', darkMode ? 'dark' : 'light')

    this.updatePanelUI()
    logseq.showMainUI({ autoFocus: true })

    // Load templates if not already loaded
    if (!this.templates && !this.isLoading) {
      await this.loadMarketplace()
    }
  }

  /**
   * Hide the main panel
   */
  closePanel(): void {
    logseq.hideMainUI()
  }

  /**
   * Update the panel UI with current state
   */
  private updatePanelUI(): void {
    const container = document.getElementById('ontology-panel-root')
    if (container) {
      container.innerHTML = getMainPanelHTML(this.templates, this.isLoading, this.error)
      this.attachEventListeners(container)
    }
  }

  /**
   * Attach event listeners to panel elements
   */
  private attachEventListeners(container: HTMLElement): void {
    // Close panel (backdrop and X button)
    container.querySelectorAll('[data-action="close"]').forEach((el) => {
      el.addEventListener('click', () => this.closePanel())
    })

    // Import from file
    container.querySelector('[data-action="import-file"]')?.addEventListener('click', () => {
      void this.importFromFile()
    })

    // Export template
    container.querySelector('[data-action="export"]')?.addEventListener('click', () => {
      void this.exportTemplate()
    })

    // Refresh marketplace
    container.querySelector('[data-action="refresh"]')?.addEventListener('click', () => {
      void this.refreshMarketplace()
    })

    // Open settings
    container.querySelector('[data-action="settings"]')?.addEventListener('click', () => {
      this.openSettings()
    })

    // Import template buttons
    container.querySelectorAll('[data-action="import-template"]').forEach((el) => {
      el.addEventListener('click', () => {
        const url = el.getAttribute('data-url')
        const name = el.getAttribute('data-name')
        if (url && name) {
          void this.importTemplate(url, name)
        }
      })
    })
  }

  /**
   * Load marketplace templates
   */
  async loadMarketplace(): Promise<void> {
    this.isLoading = true
    this.error = null
    this.updatePanelUI()

    try {
      const settings = getSettings()
      const result = await fetchMarketplaceTemplates(settings.marketplaceRepo)
      this.templates = result.templates
      this.error = null
      logger.info('Marketplace loaded', { count: this.templates.length })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load marketplace'
      this.error = message
      logger.error('Failed to load marketplace', err)
    } finally {
      this.isLoading = false
      this.updatePanelUI()
    }
  }

  /**
   * Refresh the marketplace
   */
  async refreshMarketplace(): Promise<void> {
    this.templates = null
    await this.loadMarketplace()
  }

  /**
   * Import a template from the marketplace
   */
  async importTemplate(url: string, name: string): Promise<void> {
    try {
      this.closePanel()
      await showMessage(`Fetching ${name}...`, 'info')

      const content = await fetchTemplateContent(url)
      logger.info('Template fetched', { name, size: content.length })

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
        // Refresh UI to show newly created items
        await refreshLogseqUI()
      } else {
        const errorMsg = result.errors.map((e) => e.message).join(', ')
        await showMessage(`Import failed: ${errorMsg}`, 'error')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Template import failed', error)
      await showMessage(`Import failed: ${message}`, 'error')
    }
  }

  /**
   * Handle the import from file command
   */
  async importFromFile(): Promise<void> {
    try {
      this.closePanel()

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
        // Refresh UI to show newly created items
        await refreshLogseqUI()
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
  async exportTemplate(): Promise<void> {
    try {
      this.closePanel()

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
   * Open plugin settings
   */
  openSettings(): void {
    this.closePanel()
    logseq.showSettingsUI()
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
            '2. Configure sources in plugin settings',
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      logger.error('Source management failed', error)
      await showMessage(`Failed to load sources: ${message}`, 'error')
    }
  }
}
