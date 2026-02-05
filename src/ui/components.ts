/**
 * UI Components module
 * Provides reusable UI components for the plugin
 */

/**
 * Show a notification message
 */
export async function showMessage(
  message: string,
  type: 'success' | 'error' | 'warning' | 'info' = 'info'
): Promise<void> {
  await logseq.UI.showMsg(message, type)
}

/**
 * CSS styles for the confirmation dialog
 */
const confirmDialogStyles = `
  .ontology-confirm-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 9998;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ontology-confirm-dialog {
    background: var(--ls-primary-background-color, #fff);
    border: 1px solid var(--ls-border-color, #ddd);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    max-width: 450px;
    width: 90vw;
    font-family: var(--ls-font-family, system-ui, sans-serif);
    animation: ontology-dialog-appear 0.15s ease-out;
  }

  @keyframes ontology-dialog-appear {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .ontology-confirm-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--ls-border-color, #ddd);
  }

  .ontology-confirm-icon {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    flex-shrink: 0;
  }

  .ontology-confirm-icon.info {
    background: #e3f2fd;
    color: #1976d2;
  }

  .ontology-confirm-icon.warning {
    background: #fff3e0;
    color: #f57c00;
  }

  .ontology-confirm-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--ls-primary-text-color, #333);
    margin: 0;
  }

  .ontology-confirm-body {
    padding: 16px 20px;
  }

  .ontology-confirm-message {
    font-size: 14px;
    line-height: 1.5;
    color: var(--ls-primary-text-color, #333);
    margin: 0;
    white-space: pre-wrap;
  }

  .ontology-confirm-details {
    margin-top: 12px;
    padding: 12px;
    background: var(--ls-secondary-background-color, #f5f5f5);
    border-radius: 6px;
    font-size: 13px;
    color: var(--ls-secondary-text-color, #666);
  }

  .ontology-confirm-details-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
  }

  .ontology-confirm-details-item .icon {
    color: var(--ls-active-primary-color, #007bff);
  }

  .ontology-confirm-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--ls-border-color, #ddd);
  }

  .ontology-confirm-btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .ontology-confirm-btn.cancel {
    background: var(--ls-secondary-background-color, #f5f5f5);
    border: 1px solid var(--ls-border-color, #ddd);
    color: var(--ls-primary-text-color, #333);
  }

  .ontology-confirm-btn.cancel:hover {
    background: var(--ls-tertiary-background-color, #eee);
  }

  .ontology-confirm-btn.confirm {
    background: var(--ls-active-primary-color, #007bff);
    border: 1px solid var(--ls-active-primary-color, #007bff);
    color: white;
  }

  .ontology-confirm-btn.confirm:hover {
    opacity: 0.9;
  }

  /* Dark mode */
  [data-theme="dark"] .ontology-confirm-dialog {
    background: #1e1e1e;
    border-color: #3a3a3a;
  }

  [data-theme="dark"] .ontology-confirm-header {
    border-bottom-color: #3a3a3a;
  }

  [data-theme="dark"] .ontology-confirm-title {
    color: #e0e0e0;
  }

  [data-theme="dark"] .ontology-confirm-message {
    color: #e0e0e0;
  }

  [data-theme="dark"] .ontology-confirm-details {
    background: #2a2a2a;
    color: #aaa;
  }

  [data-theme="dark"] .ontology-confirm-footer {
    border-top-color: #3a3a3a;
  }

  [data-theme="dark"] .ontology-confirm-btn.cancel {
    background: #2a2a2a;
    border-color: #3a3a3a;
    color: #e0e0e0;
  }

  [data-theme="dark"] .ontology-confirm-btn.cancel:hover {
    background: #333;
  }

  [data-theme="dark"] .ontology-confirm-icon.info {
    background: #1e3a5f;
    color: #64b5f6;
  }

  [data-theme="dark"] .ontology-confirm-icon.warning {
    background: #4a3000;
    color: #ffb74d;
  }
`

// Track if styles have been injected
let confirmStylesInjected = false

/**
 * Inject confirmation dialog styles (only once)
 */
function injectConfirmStyles(): void {
  if (confirmStylesInjected) return
  logseq.provideStyle({ key: 'ontology-confirm-styles', style: confirmDialogStyles })
  confirmStylesInjected = true
}

/**
 * Import preview data structure
 */
export interface ImportPreviewData {
  newItems: number
  updatedItems: number
  conflicts: number
}

// Global state for confirm dialog callbacks
let confirmDialogResolver: ((value: boolean) => void) | null = null
let confirmDialogHasChanges = false
const CONFIRM_DIALOG_KEY = 'ontology-confirm-dialog'

/**
 * Register confirm dialog model handlers
 * Call this once during plugin initialization
 */
export function registerConfirmDialogHandlers(): void {
  logseq.provideModel({
    ontologyConfirmProceed: () => {
      logseq.provideUI({ key: CONFIRM_DIALOG_KEY, template: '' })
      if (confirmDialogResolver) {
        confirmDialogResolver(confirmDialogHasChanges)
        confirmDialogResolver = null
      }
    },
    ontologyConfirmCancel: () => {
      logseq.provideUI({ key: CONFIRM_DIALOG_KEY, template: '' })
      if (confirmDialogResolver) {
        confirmDialogResolver(false)
        confirmDialogResolver = null
      }
    },
  })
}

/**
 * Show a Logseq-native confirmation dialog for import preview
 * @param preview - The import preview data
 * @returns Promise that resolves to true if confirmed, false if cancelled
 */
export function showImportConfirm(preview: ImportPreviewData): Promise<boolean> {
  return new Promise((resolve) => {
    injectConfirmStyles()

    const hasConflicts = preview.conflicts > 0
    const hasChanges = preview.newItems > 0 || preview.updatedItems > 0

    // Store resolver and state for model callbacks
    confirmDialogResolver = resolve
    confirmDialogHasChanges = hasChanges

    // Build details list
    const detailItems: string[] = []
    if (preview.newItems > 0) {
      detailItems.push(`<div class="ontology-confirm-details-item"><span class="icon">+</span> ${preview.newItems} new item${preview.newItems !== 1 ? 's' : ''} to add</div>`)
    }
    if (preview.updatedItems > 0) {
      detailItems.push(`<div class="ontology-confirm-details-item"><span class="icon">↻</span> ${preview.updatedItems} item${preview.updatedItems !== 1 ? 's' : ''} to update</div>`)
    }
    if (preview.conflicts > 0) {
      detailItems.push(`<div class="ontology-confirm-details-item"><span class="icon" style="color: #f57c00">⚠</span> ${preview.conflicts} conflict${preview.conflicts !== 1 ? 's' : ''} detected</div>`)
    }

    const template = `
      <div class="ontology-confirm-backdrop" data-on-click="ontologyConfirmCancel">
        <div class="ontology-confirm-dialog">
          <div class="ontology-confirm-header">
            <div class="ontology-confirm-icon ${hasConflicts ? 'warning' : 'info'}">
              ${hasConflicts ? '⚠' : 'ℹ'}
            </div>
            <h3 class="ontology-confirm-title">Import Preview</h3>
          </div>
          <div class="ontology-confirm-body">
            <p class="ontology-confirm-message">${hasChanges ? 'The following changes will be applied to your ontology:' : 'No changes detected.'}</p>
            ${detailItems.length > 0 ? `<div class="ontology-confirm-details">${detailItems.join('')}</div>` : ''}
            ${hasConflicts ? '<p class="ontology-confirm-message" style="margin-top: 12px; color: #f57c00;">Some items have conflicts that may require attention.</p>' : ''}
          </div>
          <div class="ontology-confirm-footer">
            <button class="ontology-confirm-btn cancel" data-on-click="ontologyConfirmCancel">Cancel</button>
            <button class="ontology-confirm-btn confirm" data-on-click="ontologyConfirmProceed">${hasChanges ? 'Proceed with Import' : 'Close'}</button>
          </div>
        </div>
      </div>
    `

    // Render the dialog
    logseq.provideUI({
      key: CONFIRM_DIALOG_KEY,
      template,
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        zIndex: '9999',
      },
    })
  })
}

/**
 * Show a confirmation dialog (legacy sync wrapper)
 * @deprecated Use showImportConfirm for import operations
 */
export function showConfirm(message: string): boolean {
  // Keep sync version for backwards compatibility
  return window.confirm(message)
}

/**
 * CSS styles for the progress dialog
 */
const progressDialogStyles = `
  .ontology-progress-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 9998;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ontology-progress-dialog {
    background: var(--ls-primary-background-color, #fff);
    border: 1px solid var(--ls-border-color, #ddd);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    width: 400px;
    max-width: 90vw;
    font-family: var(--ls-font-family, system-ui, sans-serif);
    animation: ontology-dialog-appear 0.15s ease-out;
    overflow: hidden;
  }

  .ontology-progress-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid var(--ls-border-color, #ddd);
  }

  .ontology-progress-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--ls-border-color, #ddd);
    border-top-color: var(--ls-active-primary-color, #007bff);
    border-radius: 50%;
    animation: ontology-spin 0.8s linear infinite;
  }

  .ontology-progress-spinner.done {
    border-color: #4caf50;
    border-top-color: #4caf50;
    animation: none;
    background: #4caf50;
    position: relative;
  }

  .ontology-progress-spinner.done::after {
    content: '';
    position: absolute;
    top: 4px;
    left: 7px;
    width: 4px;
    height: 8px;
    border: solid white;
    border-width: 0 2px 2px 0;
    transform: rotate(45deg);
  }

  @keyframes ontology-spin {
    to { transform: rotate(360deg); }
  }

  .ontology-progress-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--ls-primary-text-color, #333);
    margin: 0;
  }

  .ontology-progress-body {
    padding: 20px;
  }

  .ontology-progress-phase {
    font-size: 13px;
    color: var(--ls-secondary-text-color, #666);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .ontology-progress-message {
    font-size: 14px;
    color: var(--ls-primary-text-color, #333);
    margin-bottom: 16px;
    min-height: 20px;
  }

  .ontology-progress-bar-container {
    background: var(--ls-secondary-background-color, #f0f0f0);
    border-radius: 4px;
    height: 8px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .ontology-progress-bar {
    height: 100%;
    background: var(--ls-active-primary-color, #007bff);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .ontology-progress-bar.complete {
    background: #4caf50;
  }

  .ontology-progress-stats {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--ls-secondary-text-color, #666);
  }

  .ontology-progress-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--ls-border-color, #ddd);
    display: flex;
    justify-content: flex-end;
  }

  .ontology-progress-footer.hidden {
    display: none;
  }

  /* Dark mode */
  [data-theme="dark"] .ontology-progress-dialog {
    background: #1e1e1e;
    border-color: #3a3a3a;
  }

  [data-theme="dark"] .ontology-progress-header {
    border-bottom-color: #3a3a3a;
  }

  [data-theme="dark"] .ontology-progress-title {
    color: #e0e0e0;
  }

  [data-theme="dark"] .ontology-progress-phase {
    color: #888;
  }

  [data-theme="dark"] .ontology-progress-message {
    color: #e0e0e0;
  }

  [data-theme="dark"] .ontology-progress-bar-container {
    background: #2a2a2a;
  }

  [data-theme="dark"] .ontology-progress-stats {
    color: #888;
  }

  [data-theme="dark"] .ontology-progress-footer {
    border-top-color: #3a3a3a;
  }

  [data-theme="dark"] .ontology-progress-spinner {
    border-color: #3a3a3a;
    border-top-color: #5a9cf8;
  }
`

// Track if progress styles have been injected
let progressStylesInjected = false

/**
 * Inject progress dialog styles (only once)
 */
function injectProgressStyles(): void {
  if (progressStylesInjected) return
  logseq.provideStyle({ key: 'ontology-progress-styles', style: progressDialogStyles })
  progressStylesInjected = true
}

/**
 * Progress data for the progress dialog
 */
export interface ProgressData {
  phase: string
  message: string
  current: number
  total: number
  percentage?: number
}

/**
 * Progress dialog controller
 */
export interface ProgressDialog {
  update: (data: ProgressData) => void
  complete: (message: string) => void
  close: () => void
}

// Global state for progress dialog
const PROGRESS_DIALOG_KEY = 'ontology-progress-dialog'

/**
 * Register progress dialog model handlers
 * Call this once during plugin initialization
 */
export function registerProgressDialogHandlers(): void {
  logseq.provideModel({
    ontologyProgressClose: () => {
      logseq.provideUI({ key: PROGRESS_DIALOG_KEY, template: '' })
    },
  })
}

/**
 * Show a progress dialog for import operations
 * @returns A controller object to update/close the dialog
 */
export function showProgressDialog(title: string = 'Importing...'): ProgressDialog {
  injectProgressStyles()

  // Simple static template - no progress updates to avoid flashing
  // Progress updates via logseq.provideUI cause full iframe re-renders which flash
  const getTemplate = (isDone: boolean, completionMessage?: string) => `
    <div class="ontology-progress-backdrop">
      <div class="ontology-progress-dialog">
        <div class="ontology-progress-header">
          <div class="ontology-progress-spinner ${isDone ? 'done' : ''}"></div>
          <h3 class="ontology-progress-title">${isDone ? 'Import Complete' : title}</h3>
        </div>
        <div class="ontology-progress-body">
          <div class="ontology-progress-phase">${isDone ? 'Complete' : 'Importing'}</div>
          <div class="ontology-progress-message">${isDone ? completionMessage : 'Please wait while your ontology is being imported...'}</div>
          ${
            isDone
              ? ''
              : `
          <div class="ontology-progress-bar-container">
            <div class="ontology-progress-bar" style="width: 100%; animation: ontology-progress-indeterminate 1.5s ease-in-out infinite;"></div>
          </div>
          `
          }
        </div>
        <div class="ontology-progress-footer ${isDone ? '' : 'hidden'}">
          <button class="ontology-confirm-btn confirm" data-on-click="ontologyProgressClose">Done</button>
        </div>
      </div>
    </div>
  `

  // Add indeterminate progress animation to styles
  const indeterminateStyle = `
    @keyframes ontology-progress-indeterminate {
      0% { transform: translateX(-100%); }
      50% { transform: translateX(0%); }
      100% { transform: translateX(100%); }
    }
  `
  logseq.provideStyle({ key: 'ontology-progress-indeterminate', style: indeterminateStyle })

  // Initial render - static loading state
  logseq.provideUI({
    key: PROGRESS_DIALOG_KEY,
    template: getTemplate(false),
    style: {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      zIndex: '9999',
    },
  })

  return {
    // Update is a no-op - we don't update during import to avoid flashing
    update(_data: ProgressData) {
      // Intentionally do nothing - updates cause flashing
    },

    complete(message: string) {
      // Only re-render on completion
      logseq.provideUI({
        key: PROGRESS_DIALOG_KEY,
        template: getTemplate(true, message),
        style: {
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          bottom: '0',
          zIndex: '9999',
        },
      })
    },

    close() {
      logseq.provideUI({ key: PROGRESS_DIALOG_KEY, template: '' })
    },
  }
}

/**
 * Create a file picker dialog
 */
export async function pickFile(accept?: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (accept) {
      input.accept = accept
    }

    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      resolve(file || null)
    }

    input.oncancel = () => {
      resolve(null)
    }

    input.click()
  })
}
