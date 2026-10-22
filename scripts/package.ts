import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'

const STRIPPED_FIELDS = ['type', 'scripts', 'devDependencies', 'trustedDependencies', 'engines']

/** Relative file paths that markdown links or images point at (no URLs, anchors, or absolute paths). */
export function localLinks(markdown: string): string[] {
  const found = new Set<string>()
  const pattern = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
  for (const match of markdown.matchAll(pattern)) {
    const target = match[1].split('#')[0].split('?')[0]
    if (!target || target.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue
    found.add(normalize(decodeURI(target)))
  }
  return [...found]
}

async function copyInto(root: string, dist: string, relPath: string): Promise<void> {
  const from = join(root, relPath)
  if (!existsSync(from)) throw new Error(`package: missing file "${relPath}" (copy source ${from})`)
  const to = join(dist, relPath)
  await mkdir(dirname(to), { recursive: true })
  await copyFile(from, to)
}

export async function packagePlugin(root: string): Promise<void> {
  const dist = join(root, 'dist')
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  for (const field of STRIPPED_FIELDS) delete pkg[field]
  await mkdir(dist, { recursive: true })
  await writeFile(join(dist, 'package.json'), JSON.stringify(pkg, null, 2))

  for (const file of ['icon.svg', 'CHANGELOG.md', 'LICENSE']) await copyInto(root, dist, file)

  // Logseq reads lowercase readme.md from the plugin folder.
  const readme = await readFile(join(root, 'README.md'), 'utf8')
  await writeFile(join(dist, 'readme.md'), readme)
  for (const link of localLinks(readme)) {
    if (link === 'CHANGELOG.md' || link === 'LICENSE' || link === 'icon.svg') continue
    await copyInto(root, dist, link)
  }
}

if (import.meta.main) {
  await packagePlugin(process.cwd())
}
