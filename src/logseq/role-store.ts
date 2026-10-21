import type { RoleDefinition } from '../role/types'
import type { ExportSnapshot } from '../role/export'
import type { LogseqLike } from './types'

export const ROLES_PAGE = 'Ontology Roles'

export type StoredRole = RoleDefinition & {
  lastExport?: ExportSnapshot & { exportedAt: string }
}

interface RoleBlock {
  uuid: string
  role: StoredRole
}

/** Saved roles, one JSON block each on a hidden Logseq page. */
export class RoleStore {
  constructor(private readonly api: LogseqLike) {}

  async load(): Promise<StoredRole[]> {
    if (!(await this.api.Editor.getPage(ROLES_PAGE))) return []
    return (await this.readBlocks()).map((b) => b.role)
  }

  async save(role: StoredRole): Promise<void> {
    const page = await this.ensurePage()
    const content = JSON.stringify(role)
    const existing = (await this.readBlocks()).find((b) => b.role.name === role.name)
    if (existing) await this.api.Editor.updateBlock(existing.uuid, content)
    else await this.api.Editor.appendBlockInPage(page.uuid, content)
  }

  async remove(name: string): Promise<void> {
    if (!(await this.api.Editor.getPage(ROLES_PAGE))) return
    const existing = (await this.readBlocks()).find((b) => b.role.name === name)
    if (existing) await this.api.Editor.removeBlock(existing.uuid)
  }

  private async ensurePage(): Promise<{ uuid: string }> {
    const found = await this.api.Editor.getPage(ROLES_PAGE)
    if (found) return found
    const page = await this.api.Editor.createPage(ROLES_PAGE, {}, { redirect: false })
    if (!page) throw new Error(`Could not create the ${ROLES_PAGE} page`)
    try {
      await this.api.Editor.upsertBlockProperty(page.uuid, ':logseq.property/hide?', true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error('Could not hide the Ontology Roles page: ' + msg)
    }
    return page
  }

  private async readBlocks(): Promise<RoleBlock[]> {
    const blocks = (await this.api.Editor.getPageBlocksTree(ROLES_PAGE)) ?? []
    const out: RoleBlock[] = []
    for (const block of blocks) {
      // createPage leaves an empty first block; it holds no role.
      if (block.content.trim() === '') continue
      try {
        out.push({ uuid: block.uuid, role: JSON.parse(block.content) as StoredRole })
      } catch {
        throw new Error(`Block ${block.uuid} on the ${ROLES_PAGE} page is not valid role JSON`)
      }
    }
    return out
  }
}
