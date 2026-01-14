/**
 * UI Components module
 * Provides reusable UI components for the plugin
 */

import '@logseq/libs'

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
 */
export async function showConfirm(message: string): Promise<boolean> {
  return await logseq.UI.confirm(message)
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
