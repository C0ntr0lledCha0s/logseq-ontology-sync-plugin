/**
 * Plugin Controller
 *
 * Registers the toolbar button and command palette entry, and opens the
 * role builder main UI.
 */

import { logger } from './utils/logger'

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
