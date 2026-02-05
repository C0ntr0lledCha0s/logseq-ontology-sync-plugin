import '@logseq/libs'
import { logger } from './utils/logger'
import { PluginController } from './plugin-controller'
import { settingsSchema } from './settings'
import { registerConfirmDialogHandlers, registerProgressDialogHandlers } from './ui/components'

const pluginId = 'logseq-ontology-sync'

// Guard against multiple registrations using window object
// This survives script re-evaluation during reload
const INIT_KEY = `__${pluginId}_initialized__`

function isAlreadyInitialized(): boolean {
  return (window as unknown as Record<string, boolean>)[INIT_KEY] === true
}

function markInitialized(): void {
  ;(window as unknown as Record<string, boolean>)[INIT_KEY] = true
}

function clearInitialized(): void {
  delete (window as unknown as Record<string, boolean>)[INIT_KEY]
}

/**
 * Handle uncaught promise rejections that are DataCloneErrors
 *
 * Logseq's plugin API uses postMessage for IPC. Some internal callbacks
 * return objects containing functions that can't be serialized, causing
 * DataCloneError. These errors are cosmetic - the actual operations succeed.
 * This handler suppresses these specific errors to avoid console noise.
 */
function setupDataCloneErrorHandler(): void {
  window.addEventListener('unhandledrejection', (event) => {
    const error: unknown = event.reason
    const isDataCloneError =
      (error instanceof Error &&
        (error.name === 'DataCloneError' || error.message.includes('could not be cloned'))) ||
      (typeof error === 'string' &&
        (error.includes('DataCloneError') || error.includes('could not be cloned')))

    if (isDataCloneError) {
      // Prevent the error from appearing in console
      event.preventDefault()
      // Log at debug level for troubleshooting if needed
      logger.debug('Suppressed DataCloneError from Logseq IPC (operation succeeded)')
    }
  })
}

function main(): void {
  if (isAlreadyInitialized()) {
    logger.debug(`[${pluginId}] Plugin already initialized, skipping registration`)
    return
  }
  markInitialized()

  // Set up handler to suppress cosmetic DataCloneErrors from Logseq IPC
  setupDataCloneErrorHandler()

  logger.info(`[${pluginId}] Plugin loaded`)

  // Register settings schema
  logseq.useSettingsSchema(settingsSchema)

  // Initialize the plugin controller
  const controller = new PluginController()
  controller.initializeUI()

  // Register dialog handlers (must be called before showing dialogs)
  registerConfirmDialogHandlers()
  registerProgressDialogHandlers()

  // Provide model for UI event handlers
  logseq.provideModel({
    // Panel controls
    showPanel: () => void controller.showPanel(),
    closePanel: () => controller.closePanel(),

    // Actions
    importFromFile: () => void controller.importFromFile(),
    exportTemplate: () => void controller.exportTemplate(),
    refreshMarketplace: () => void controller.refreshMarketplace(),
    openSettings: () => controller.openSettings(),

    // Template import
    importTemplate: (e: { dataset: { url: string; name: string } }) => {
      void controller.importTemplate(e.dataset.url, e.dataset.name)
    },
  })

  // Register UI icon in toolbar - opens main panel
  logseq.App.registerUIItem('toolbar', {
    key: pluginId,
    template: `<a class="button" data-on-click="showPanel" title="Ontology Sync"><i class="ti ti-building-arch"></i></a>`,
  })

  // Register command palette commands
  logseq.App.registerCommandPalette(
    { key: 'open-panel', label: 'Ontology: Open Panel' },
    () => void controller.showPanel()
  )

  logseq.App.registerCommandPalette(
    { key: 'import-file', label: 'Ontology: Import from File' },
    () => void controller.importFromFile()
  )

  logseq.App.registerCommandPalette(
    { key: 'export', label: 'Ontology: Export Template' },
    () => void controller.exportTemplate()
  )

  logseq.App.registerCommandPalette(
    { key: 'sync', label: 'Ontology: Sync from Sources' },
    () => void controller.handleSync()
  )

  logseq.App.registerCommandPalette({ key: 'settings', label: 'Ontology: Open Settings' }, () =>
    controller.openSettings()
  )

  // Clean up on plugin unload
  logseq.beforeunload(async () => {
    logger.info(`[${pluginId}] Plugin unloading`)
    clearInitialized()
    await Promise.resolve()
  })

  logger.info(`[${pluginId}] Plugin ready`)
}

// Bootstrap the plugin
logseq.ready(main).catch((err: unknown) => logger.error('Plugin failed to load', err))
