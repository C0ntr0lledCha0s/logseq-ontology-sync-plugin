import '@logseq/libs'
import { logger } from './utils/logger'

const pluginId = 'logseq-ontology-sync'

function main(): void {
  logger.info(`[${pluginId}] Plugin loaded`)

  // Register plugin settings
  logseq.useSettingsSchema([
    {
      key: 'defaultTemplatePath',
      type: 'string',
      title: 'Default Template Path',
      description: 'Default path for template files',
      default: '',
    },
  ])

  // Register UI commands
  logseq.App.registerCommandPalette(
    {
      key: 'ontology-sync-import',
      label: 'Import Ontology Template',
    },
    () => {
      void logseq.UI.showMsg('Import functionality coming soon!', 'info')
    }
  )

  logseq.App.registerCommandPalette(
    {
      key: 'ontology-sync-export',
      label: 'Export Ontology Template',
    },
    () => {
      void logseq.UI.showMsg('Export functionality coming soon!', 'info')
    }
  )

  // Register UI icon in toolbar
  logseq.App.registerUIItem('toolbar', {
    key: pluginId,
    template: `
      <a class="button" data-on-click="showOntologyPanel">
        <i class="ti ti-hierarchy"></i>
      </a>
    `,
  })

  logseq.provideModel({
    showOntologyPanel: () => {
      void logseq.UI.showMsg('Ontology Sync Panel', 'info')
    },
  })
}

// Bootstrap the plugin
logseq.ready(main).catch((err: unknown) => logger.error('Plugin failed to load', err))
