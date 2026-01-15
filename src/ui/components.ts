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
 * Show a confirmation dialog
 * Uses native browser confirm since @logseq/libs IUIProxy doesn't have a confirm method
 */
export function showConfirm(message: string): boolean {
  return window.confirm(message)
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

/**
 * Menu action types
 */
export type MenuAction = 'import-url' | 'import-file' | 'manage-sources' | 'sync' | 'cancelled'

/**
 * Show the main ontology menu using sequential confirm dialogs
 */
export function showOntologyMenu(): MenuAction {
  // First choice: Import or Other
  const wantsImport = window.confirm(
    'Ontology Sync\n\n' + 'Click OK to IMPORT a template\n' + 'Click Cancel for other options'
  )

  if (wantsImport) {
    // Import submenu: URL or File
    const wantsUrl = window.confirm(
      'Import Template\n\n' + 'Click OK to import from URL\n' + 'Click Cancel to import from File'
    )
    return wantsUrl ? 'import-url' : 'import-file'
  }

  // Other options: Sync or Manage
  const wantsSync = window.confirm(
    'Other Options\n\n' + 'Click OK to SYNC from sources\n' + 'Click Cancel to MANAGE sources'
  )

  return wantsSync ? 'sync' : 'manage-sources'
}

/**
 * Get URL from clipboard
 * Returns the clipboard content if user confirms, null otherwise
 */
export async function getUrlFromClipboard(): Promise<string | null> {
  try {
    const clipboardText = await navigator.clipboard.readText()
    const trimmed = clipboardText.trim()

    if (!trimmed) {
      await showMessage('Clipboard is empty. Copy a URL first, then try again.', 'warning')
      return null
    }

    // Show what's in clipboard and confirm
    const confirmed = window.confirm(
      `Import from URL\n\n` +
        `URL in clipboard:\n${trimmed.substring(0, 100)}${trimmed.length > 100 ? '...' : ''}\n\n` +
        `Click OK to import from this URL\n` +
        `Click Cancel to abort`
    )

    return confirmed ? trimmed : null
  } catch {
    await showMessage('Could not read clipboard. Please copy the URL and try again.', 'error')
    return null
  }
}

/**
 * Validate that a string is a valid URL
 */
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
