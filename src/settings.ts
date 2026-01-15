/**
 * Plugin Settings
 * Settings schema and types for the ontology sync plugin
 */

import type { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin'

/** Default marketplace repository */
export const DEFAULT_MARKETPLACE_REPO = 'C0ntr0lledCha0s/logseq-template-graph'

/**
 * Plugin settings interface
 */
export interface PluginSettings {
  marketplaceRepo: string
  autoSync: boolean
  syncInterval: string
}

/**
 * Default settings values
 */
export const defaultSettings: PluginSettings = {
  marketplaceRepo: DEFAULT_MARKETPLACE_REPO,
  autoSync: false,
  syncInterval: 'daily',
}

/**
 * Settings schema for Logseq settings panel
 */
export const settingsSchema: SettingSchemaDesc[] = [
  {
    key: 'marketplaceHeading',
    title: 'Marketplace Settings',
    description: 'Configure the template marketplace source',
    type: 'heading',
    default: null,
  },
  {
    key: 'marketplaceRepo',
    title: 'Marketplace Repository',
    description:
      'GitHub repository for ontology templates (format: owner/repo). ' +
      'Templates are loaded from the latest release assets.',
    type: 'string',
    default: DEFAULT_MARKETPLACE_REPO,
  },
  {
    key: 'syncHeading',
    title: 'Sync Settings',
    description: 'Configure automatic synchronization',
    type: 'heading',
    default: null,
  },
  {
    key: 'autoSync',
    title: 'Enable Auto-Sync',
    description: 'Automatically check for updates from configured sources',
    type: 'boolean',
    default: false,
  },
  {
    key: 'syncInterval',
    title: 'Sync Interval',
    description: 'How often to check for updates when auto-sync is enabled',
    type: 'enum',
    enumChoices: ['hourly', 'daily', 'weekly'],
    enumPicker: 'select',
    default: 'daily',
  },
]

/**
 * Get current settings with defaults
 */
export function getSettings(): PluginSettings {
  const settings = logseq.settings as Partial<PluginSettings> | undefined
  return {
    marketplaceRepo: settings?.marketplaceRepo ?? defaultSettings.marketplaceRepo,
    autoSync: settings?.autoSync ?? defaultSettings.autoSync,
    syncInterval: settings?.syncInterval ?? defaultSettings.syncInterval,
  }
}
