/**
 * Plugin Controller
 *
 * Registers the toolbar button and command palette entry, and opens the
 * role builder main UI.
 */

import { logger } from './utils/logger'
import { RoleStore } from './logseq/role-store'
import { readLivePropertySchemas } from './logseq/live-graph'
import type { LogseqLike } from './logseq/types'

const PLUGIN_ID = 'logseq-ontology-sync'

export class PluginController {
  /** Register the toolbar button and command palette command. */
  initializeUI(): void {
    logseq.provideModel({
      openBuilder: () => void this.openBuilder(),
      closeBuilder: () => logseq.hideMainUI(),
    })

    logseq.App.registerUIItem('toolbar', {
      key: PLUGIN_ID,
      template: `<a class="button" data-on-click="openBuilder" title="Ontology role builder"><i class="ti ti-building-arch"></i></a>`,
    })

    logseq.App.registerCommandPalette(
      { key: 'open-role-builder', label: 'Ontology: Open role builder' },
      () => void this.openBuilder()
    )

    // TEMPORARY: remove after in-Logseq verification (Task 6 Step 5)
    logseq.App.registerCommandPalette(
      { key: 'ontology-self-test', label: 'Ontology: self-test' },
      () => void runSelfTest()
    )

    logger.info('PluginController initialized')
  }

  /** Show the role builder main UI. */
  openBuilder(): Promise<void> {
    logseq.setMainUIInlineStyle({
      position: 'fixed',
      zIndex: 11,
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(0,0,0,0.4)',
    })
    const root = document.getElementById('app') ?? document.body
    root.innerHTML = `
      <div style="background:var(--ls-primary-background-color,#fff);color:var(--ls-primary-text-color,#000);padding:24px;border-radius:8px;min-width:320px">
        <p>Role builder loading…</p>
        <button id="role-builder-close" type="button">Close</button>
      </div>`
    document.getElementById('role-builder-close')?.addEventListener('click', () => {
      logseq.hideMainUI()
    })
    logseq.showMainUI()
    return Promise.resolve()
  }
}

// TEMPORARY: remove after in-Logseq verification (Task 6 Step 5)
async function runSelfTest(): Promise<void> {
  try {
    const api = logseq as unknown as LogseqLike
    const store = new RoleStore(api)
    await store.save({
      name: 'Self-test role',
      libraryVersion: 'self-test',
      presets: [],
      classOverrides: {},
      propertyOverrides: {},
    })
    const roles = await store.load()
    await logseq.UI.showMsg(`Self-test roles: ${roles.map((r) => r.name).join(', ')}`)

    const raw = await api.DB.datascriptQuery<unknown[]>(
      '[:find ?ident ?type ?card :where [?p :db/ident ?ident] [?p :logseq.property/type ?type] [?p :db/cardinality ?card]]'
    )
    const rawHead = JSON.stringify(raw.slice(0, 3))
    const schemas = await readLivePropertySchemas(api)
    const email = schemas.get('schema.property/email')
    const emailText = email ? JSON.stringify(email) : 'not present'
    // eslint-disable-next-line no-console
    console.log('[self-test] email schema:', emailText, 'raw first 3 rows:', rawHead)
    await logseq.UI.showMsg(`Self-test email: ${emailText}`)
    await logseq.UI.showMsg(`Self-test raw rows: ${rawHead}`)
  } catch (e) {
    await logseq.UI.showMsg(
      `Self-test failed: ${e instanceof Error ? e.message : String(e)}`,
      'error'
    )
  }
}
