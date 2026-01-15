import '@logseq/libs'
import { logger } from './utils/logger'
import { PluginController } from './plugin-controller'
import { settingsSchema } from './settings'

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

  // Register settings schema
  logseq.useSettingsSchema(settingsSchema)

  // Initialize the plugin controller
  const controller = new PluginController()
  controller.initializeUI()

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
