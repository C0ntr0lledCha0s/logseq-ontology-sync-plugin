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
