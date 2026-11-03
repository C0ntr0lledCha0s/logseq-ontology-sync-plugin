/**
 * Plugin Controller
 *
 * Registers the toolbar button and command palette entry, and opens the
 * role builder main UI.
 */

import { logger } from './utils/logger'
import type { LogseqLike } from './logseq/types'
import { BuilderController } from './ui/builder/controller'
import { HOST_PROPS, hasHeadbarHeight, headerOffsetPx, themeVars } from './ui/builder/theme'

const PLUGIN_ID = 'logseq-ontology-sync'

export class PluginController {
  private builder: BuilderController | null = null
  private warnedHeadbar = false

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

    const refreshTheme = (): void =>
      void this.applyTheme().catch((e: unknown) => logger.error('Theme refresh failed', e))
    logseq.App.onThemeModeChanged(refreshTheme)
    logseq.App.onThemeChanged(refreshTheme)

    logseq.App.onCurrentGraphChanged(() => {
      this.builder?.onGraphChanged().catch((e: unknown) => logger.error('Graph change failed', e))
    })

    logger.info('PluginController initialized')
  }

  /** Show the role builder main UI. */
  async openBuilder(): Promise<void> {
    logseq.setMainUIInlineStyle({
      position: 'fixed',
      zIndex: 11,
      inset: '0',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
    })
    const root = document.getElementById('app') ?? document.body
    await this.applyTheme(root)
    this.builder ??= new BuilderController(root, {
      api: logseq as unknown as LogseqLike,
      source: {
        fetch: window.fetch.bind(window),
        storage: logseq.FileStorage,
      },
      showMsg: async (message, kind) => {
        await logseq.UI.showMsg(message, kind)
      },
      close: () => logseq.hideMainUI(),
      currentGraph: async () => {
        const graph = await logseq.App.getCurrentGraph()
        if (!graph) throw new Error('No graph is open')
        return graph.path
      },
    })
    logseq.showMainUI()
    await this.builder.open()
  }

  /**
   * Resolves the host's theme tokens and sets the builder's `--rb-*` variables on the root.
   * The top offset keeps the panel below the host's window drag strip, which swallows clicks
   * on plugin iframe content.
   */
  private async applyTheme(
    root: HTMLElement = document.getElementById('app') ?? document.body
  ): Promise<void> {
    const vals = (await logseq.UI.resolveThemeCssPropsVals(HOST_PROPS)) ?? {}
    if (!hasHeadbarHeight(vals) && !this.warnedHeadbar) {
      this.warnedHeadbar = true
      logger.warn('--ls-headbar-height not resolved; assuming 48px')
    }
    root.style.setProperty('--rb-top', `${headerOffsetPx(vals)}px`)
    for (const [name, value] of Object.entries(themeVars(vals))) root.style.setProperty(name, value)
    root.style.background = 'var(--rb-backdrop)'
  }
}
