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
 * Show the main ontology menu
 */
export function showOntologyMenu(): MenuAction {
  const choice = window.prompt(
    'Ontology Sync\n\n' +
      'Choose an action:\n\n' +
      '1 - Import from URL\n' +
      '2 - Import from File\n' +
      '3 - Manage Sources\n' +
      '4 - Sync from Sources\n\n' +
      'Enter number (1-4):',
    '1'
  )

  if (choice === null) {
    return 'cancelled'
  }

  switch (choice.trim()) {
    case '1':
      return 'import-url'
    case '2':
      return 'import-file'
    case '3':
      return 'manage-sources'
    case '4':
      return 'sync'
    default:
      return 'cancelled'
  }
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
