import '@logseq/libs'
import { logger } from './utils/logger'
import { PluginController } from './plugin-controller'

const pluginId = 'logseq-ontology-sync'

function main(): void {
  logger.info(`[${pluginId}] Plugin loaded`)

  // Initialize the plugin controller
  const controller = new PluginController()

  // Register plugin settings
  logseq.useSettingsSchema([
    {
      key: 'defaultTemplatePath',
      type: 'string',
      title: 'Default Template Path',
      description: 'Default path for template files',
      default: '',
    },
    {
      key: 'autoSync',
      type: 'boolean',
      title: 'Auto Sync',
      description: 'Automatically sync on graph open',
      default: false,
    },
    {
      key: 'validateOnImport',
      type: 'boolean',
      title: 'Validate on Import',
      description: 'Validate templates before importing',
      default: true,
    },
  ])

  // Register UI commands - connected to controller
  logseq.App.registerCommandPalette(
    {
      key: 'ontology-sync-import',
      label: 'Import Ontology Template',
    },
    () => {
      void controller.handleImport()
    }
  )

  logseq.App.registerCommandPalette(
    {
      key: 'ontology-sync-export',
      label: 'Export Ontology Template',
    },
    () => {
      void controller.handleExport()
    }
  )

  logseq.App.registerCommandPalette(
    {
      key: 'ontology-sync-sync',
      label: 'Sync Ontology from Source',
    },
    () => {
      void controller.handleSync()
    }
  )

  logseq.App.registerCommandPalette(
    {
      key: 'ontology-sync-sources',
      label: 'Manage Ontology Sources',
    },
    () => {
      void controller.handleManageSources()
    }
  )

  // Register UI icon in toolbar
  logseq.App.registerUIItem('toolbar', {
    key: pluginId,
    template: `
      <a class="button" data-on-click="showOntologyPanel" title="Ontology Sync">
        <i class="ti ti-refresh"></i>
      </a>
    `,
  })

  logseq.provideModel({
    showOntologyPanel: () => {
      void controller.handleManageSources()
    },
  })

  logger.info(`[${pluginId}] Plugin ready`)
}

// Bootstrap the plugin
logseq.ready(main).catch((err: unknown) => logger.error('Plugin failed to load', err))
