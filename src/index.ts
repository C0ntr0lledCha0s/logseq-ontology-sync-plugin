import '@logseq/libs'
import { logger } from './utils/logger'
import { PluginController } from './plugin-controller'

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

function main(): void {
  if (isAlreadyInitialized()) {
    logger.debug(`[${pluginId}] Plugin already initialized, skipping registration`)
    return
  }
  markInitialized()

  logger.info(`[${pluginId}] Plugin loaded`)

  // Initialize the plugin controller
  const controller = new PluginController()

  // Provide model first (must be before registerUIItem)
  logseq.provideModel({
    showOntologyPanel: () => {
      void controller.handleManageSources()
    },
  })

  // Register UI icon in toolbar
  logseq.App.registerUIItem('toolbar', {
    key: pluginId,
    template: `<a class="button" data-on-click="showOntologyPanel" title="Ontology Sync"><i class="ti ti-building-arch"></i></a>`,
  })

  // Register UI commands - connected to controller
  logseq.App.registerCommandPalette(
    { key: 'import', label: 'Ontology: Import Template (File)' },
    () => void controller.handleImport()
  )

  logseq.App.registerCommandPalette(
    { key: 'import-from-source', label: 'Ontology: Import from URL or File' },
    () => void controller.handleImportFromSource()
  )

  logseq.App.registerCommandPalette(
    { key: 'export', label: 'Ontology: Export Template' },
    () => void controller.handleExport()
  )

  logseq.App.registerCommandPalette(
    { key: 'sync', label: 'Ontology: Sync from Source' },
    () => void controller.handleSync()
  )

  logseq.App.registerCommandPalette(
    { key: 'sources', label: 'Ontology: Manage Sources' },
    () => void controller.handleManageSources()
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
