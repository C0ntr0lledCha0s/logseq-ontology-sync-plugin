/** Save text as a file via a temporary link, from inside the plugin iframe. */
export function downloadText(filename: string, text: string, mime = 'application/edn'): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
