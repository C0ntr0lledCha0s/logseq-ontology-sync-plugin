/**
 * Main Panel UI
 * HTML templates and styles for the plugin's main panel
 */

import type { MarketplaceTemplate } from '../marketplace'

/**
 * Generate CSS styles for the main panel
 */
export function getMainPanelStyles(): string {
  return `
    .ontology-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 500px;
      max-width: 90vw;
      max-height: 80vh;
      background: var(--ls-primary-background-color, #fff);
      border: 1px solid var(--ls-border-color, #ddd);
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      z-index: 999;
      display: flex;
      flex-direction: column;
      font-family: var(--ls-font-family, system-ui, sans-serif);
    }

    .ontology-panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--ls-border-color, #ddd);
    }

    .ontology-panel-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--ls-primary-text-color, #333);
      margin: 0;
    }

    .ontology-panel-close {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: var(--ls-secondary-text-color, #666);
      padding: 0;
      line-height: 1;
    }

    .ontology-panel-close:hover {
      color: var(--ls-primary-text-color, #333);
    }

    .ontology-panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
    }

    .ontology-panel-section {
      margin-bottom: 20px;
    }

    .ontology-panel-section-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--ls-secondary-text-color, #666);
      margin: 0 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .ontology-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .ontology-action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: var(--ls-secondary-background-color, #f5f5f5);
      border: 1px solid var(--ls-border-color, #ddd);
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      color: var(--ls-primary-text-color, #333);
      transition: background 0.15s, border-color 0.15s;
    }

    .ontology-action-btn:hover {
      background: var(--ls-tertiary-background-color, #eee);
      border-color: var(--ls-active-primary-color, #007bff);
    }

    .ontology-action-btn .icon {
      font-size: 18px;
    }

    .ontology-templates-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ontology-template-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--ls-secondary-background-color, #f5f5f5);
      border: 1px solid var(--ls-border-color, #ddd);
      border-radius: 6px;
    }

    .ontology-template-info {
      flex: 1;
    }

    .ontology-template-name {
      font-weight: 500;
      color: var(--ls-primary-text-color, #333);
      margin: 0 0 4px 0;
    }

    .ontology-template-meta {
      font-size: 12px;
      color: var(--ls-secondary-text-color, #666);
    }

    .ontology-template-btn {
      padding: 6px 12px;
      background: var(--ls-active-primary-color, #007bff);
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }

    .ontology-template-btn:hover {
      opacity: 0.9;
    }

    .ontology-loading {
      text-align: center;
      padding: 20px;
      color: var(--ls-secondary-text-color, #666);
    }

    .ontology-error {
      padding: 12px 16px;
      background: #fee;
      border: 1px solid #fcc;
      border-radius: 6px;
      color: #c00;
      font-size: 14px;
    }

    .ontology-panel-footer {
      padding: 12px 20px;
      border-top: 1px solid var(--ls-border-color, #ddd);
      font-size: 12px;
      color: var(--ls-secondary-text-color, #666);
      text-align: center;
    }

    .ontology-panel-footer a {
      color: var(--ls-active-primary-color, #007bff);
      text-decoration: none;
    }

    .ontology-panel-footer a:hover {
      text-decoration: underline;
    }

    .ontology-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      z-index: 998;
    }

    /* Dark mode overrides */
    [data-theme="dark"] .ontology-panel {
      background: #1e1e1e;
      border-color: #3a3a3a;
    }

    [data-theme="dark"] .ontology-panel-header {
      border-bottom-color: #3a3a3a;
    }

    [data-theme="dark"] .ontology-panel-title {
      color: #e0e0e0;
    }

    [data-theme="dark"] .ontology-panel-close {
      color: #888;
    }

    [data-theme="dark"] .ontology-panel-close:hover {
      color: #e0e0e0;
    }

    [data-theme="dark"] .ontology-panel-section-title {
      color: #888;
    }

    [data-theme="dark"] .ontology-action-btn {
      background: #2a2a2a;
      border-color: #3a3a3a;
      color: #e0e0e0;
    }

    [data-theme="dark"] .ontology-action-btn:hover {
      background: #333;
      border-color: #5a9cf8;
    }

    [data-theme="dark"] .ontology-template-item {
      background: #2a2a2a;
      border-color: #3a3a3a;
    }

    [data-theme="dark"] .ontology-template-name {
      color: #e0e0e0;
    }

    [data-theme="dark"] .ontology-template-meta {
      color: #888;
    }

    [data-theme="dark"] .ontology-loading {
      color: #888;
    }

    [data-theme="dark"] .ontology-error {
      background: #3a1a1a;
      border-color: #5a2a2a;
      color: #ff6b6b;
    }

    [data-theme="dark"] .ontology-panel-footer {
      border-top-color: #3a3a3a;
      color: #888;
    }

    [data-theme="dark"] .ontology-panel-footer a {
      color: #5a9cf8;
    }

    [data-theme="dark"] .ontology-backdrop {
      background: rgba(0, 0, 0, 0.5);
    }
  `
}

/**
 * Generate template list HTML
 */
export function renderTemplateList(templates: MarketplaceTemplate[]): string {
  if (templates.length === 0) {
    return '<div class="ontology-loading">No templates available</div>'
  }

  return templates
    .map(
      (t) => `
    <div class="ontology-template-item">
      <div class="ontology-template-info">
        <div class="ontology-template-name">${t.name}</div>
        <div class="ontology-template-meta">v${t.version} - ${t.category}</div>
      </div>
      <button class="ontology-template-btn" data-action="import-template" data-url="${t.downloadUrl}" data-name="${t.name}">
        Import
      </button>
    </div>
  `
    )
    .join('')
}

/**
 * Generate main panel HTML
 */
export function getMainPanelHTML(
  templates: MarketplaceTemplate[] | null,
  loading: boolean,
  error: string | null
): string {
  let templatesContent: string

  if (loading) {
    templatesContent = '<div class="ontology-loading">Loading templates...</div>'
  } else if (error) {
    templatesContent = `<div class="ontology-error">${error}</div>`
  } else if (templates) {
    templatesContent = renderTemplateList(templates)
  } else {
    templatesContent = '<div class="ontology-loading">Click refresh to load templates</div>'
  }

  return `
    <div class="ontology-backdrop" data-action="close"></div>
    <div class="ontology-panel">
      <div class="ontology-panel-header">
        <h2 class="ontology-panel-title">Ontology Sync</h2>
        <button class="ontology-panel-close" data-action="close">&times;</button>
      </div>

      <div class="ontology-panel-content">
        <div class="ontology-panel-section">
          <h3 class="ontology-panel-section-title">Quick Actions</h3>
          <div class="ontology-actions">
            <button class="ontology-action-btn" data-action="import-file">
              <span class="icon">📁</span>
              <span>Import File</span>
            </button>
            <button class="ontology-action-btn" data-action="export">
              <span class="icon">💾</span>
              <span>Export</span>
            </button>
            <button class="ontology-action-btn" data-action="refresh">
              <span class="icon">🔄</span>
              <span>Refresh</span>
            </button>
            <button class="ontology-action-btn" data-action="settings">
              <span class="icon">⚙️</span>
              <span>Settings</span>
            </button>
          </div>
        </div>

        <div class="ontology-panel-section">
          <h3 class="ontology-panel-section-title">Marketplace Templates</h3>
          <div class="ontology-templates-list">
            ${templatesContent}
          </div>
        </div>
      </div>

      <div class="ontology-panel-footer">
        Templates from <a href="https://github.com/C0ntr0lledCha0s/logseq-template-graph" target="_blank">logseq-template-graph</a>
      </div>
    </div>
  `
}
