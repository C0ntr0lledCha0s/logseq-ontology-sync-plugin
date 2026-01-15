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
 * Import source type selection
 */
export type ImportSourceType = 'url' | 'file' | 'cancelled'

/**
 * Show a dialog to choose import source type (URL or File)
 */
export function promptImportSourceType(): ImportSourceType {
  const result = window.confirm(
    'Import Ontology Template\n\n' +
      'Click OK to import from a URL\n' +
      'Click Cancel to import from a local file'
  )
  // OK = URL, Cancel = file
  // We use a second confirm if they want to cancel completely
  if (result) {
    return 'url'
  }
  return 'file'
}

/**
 * Prompt the user for a URL input
 */
export function promptForUrl(
  message: string = 'Enter the URL to import from:',
  defaultValue: string = ''
): string | null {
  const result = window.prompt(message, defaultValue)
  if (result === null || result.trim() === '') {
    return null
  }
  return result.trim()
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
