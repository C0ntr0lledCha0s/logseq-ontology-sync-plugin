import { describe, test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { localLinks, packagePlugin } from '../scripts/package'

describe('localLinks', () => {
  test('extracts relative links and images, ignoring urls and anchors', () => {
    const md = [
      '![shot](docs/shot.png)',
      '[log](CHANGELOG.md#top)',
      '[web](https://example.com/a.png)',
      '[mail](mailto:a@b.c)',
      '[anchor](#usage)',
      '[abs](/etc/x)',
      '[titled](./docs/a.md "Title")',
      '[dup](docs/shot.png)',
    ].join('\n')
    expect(localLinks(md).sort()).toEqual(['CHANGELOG.md', 'docs/a.md', 'docs/shot.png'])
  })
})

describe('packagePlugin', () => {
  async function fixture(readme: string): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), 'pkg-'))
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'x', scripts: { a: 'b' }, type: 'module' }))
    for (const f of ['icon.svg', 'CHANGELOG.md', 'LICENSE']) await writeFile(join(root, f), f)
    await mkdir(join(root, 'docs'))
    await writeFile(join(root, 'docs/shot.png'), 'png')
    await writeFile(join(root, 'README.md'), readme)
    return root
  }

  test('writes readme.md, assets and stripped package.json', async () => {
    const root = await fixture('# T\n![s](docs/shot.png)')
    try {
      await packagePlugin(root)
      for (const f of ['readme.md', 'icon.svg', 'CHANGELOG.md', 'LICENSE', 'docs/shot.png']) {
        expect(existsSync(join(root, 'dist', f))).toBe(true)
      }
      const pkg = JSON.parse(await readFile(join(root, 'dist/package.json'), 'utf8'))
      expect(pkg.scripts).toBeUndefined()
      expect(pkg.type).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  test('fails when a linked file is missing', async () => {
    const root = await fixture('![s](docs/missing.png)')
    try {
      await expect(packagePlugin(root)).rejects.toThrow('docs/missing.png')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('built dist', () => {
  const dist = join(import.meta.dir, '..', 'dist')
  test.skipIf(!existsSync(join(dist, 'package.json')))('contains plugin files', () => {
    for (const f of ['readme.md', 'icon.svg', 'package.json']) expect(existsSync(join(dist, f))).toBe(true)
  })
})
