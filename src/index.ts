import '@logseq/libs'

const pluginId = 'logseq-ontology-sync'

async function main() {
  console.info(`[${pluginId}] Plugin loaded`)

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
    async () => {
      await logseq.UI.showMsg('Import functionality coming soon!', 'info')
    }
  )

  logseq.App.registerCommandPalette(
    {
      key: 'ontology-sync-export',
      label: 'Export Ontology Template',
    },
    async () => {
      await logseq.UI.showMsg('Export functionality coming soon!', 'info')
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
    showOntologyPanel: async () => {
      await logseq.UI.showMsg('Ontology Sync Panel', 'info')
    },
  })
}

// Bootstrap the plugin
logseq.ready(main).catch(console.error)
