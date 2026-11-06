import type { RoleDefinition } from '../role/types'
import type { ExportSnapshot } from '../role/export'
import { parseRoleDefinition } from '../role/role-file'
import type { LogseqLike } from './types'

/** Saved schemas live here, one JSON block each. */
export const SCHEMAS_PAGE = 'Ontology Schemas'

export type StoredRole = RoleDefinition & {
  lastExport?: ExportSnapshot & { exportedAt: string }
}

interface RoleBlock {
  uuid: string
  role: StoredRole
}

/** Saved schemas, one JSON block each on a hidden Logseq page. */
export class RoleStore {
  constructor(private readonly api: LogseqLike) {}

  async load(): Promise<StoredRole[]> {
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
    const existing = (await this.readBlocks()).find((b) => b.role.name === name)
    if (existing) await this.api.Editor.removeBlock(existing.uuid)
  }

  private async ensurePage(): Promise<{ uuid: string }> {
    const found = await this.api.Editor.getPage(SCHEMAS_PAGE)
    const page = found ?? (await this.api.Editor.createPage(SCHEMAS_PAGE, {}, { redirect: false }))
    if (!page) throw new Error(`Could not create the ${SCHEMAS_PAGE} page`)
    // The hidden state cannot be read back reliably, so re-apply it on every save (idempotent).
    try {
      await this.api.Editor.upsertBlockProperty(page.uuid, ':logseq.property/hide?', true)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      throw new Error(`Could not hide the ${SCHEMAS_PAGE} page: ${msg}`)
    }
    return page
  }

  /** The saved schemas; none when the page does not exist. */
  private async readBlocks(): Promise<RoleBlock[]> {
    if (!(await this.api.Editor.getPage(SCHEMAS_PAGE))) return []
    const blocks = (await this.api.Editor.getPageBlocksTree(SCHEMAS_PAGE)) ?? []
    const out: RoleBlock[] = []
    for (const block of blocks) {
      // createPage leaves an empty first block; it holds no schema.
      if (block.content.trim() === '') continue
      try {
        const parsed = JSON.parse(block.content) as { lastExport?: StoredRole['lastExport'] }
        const role: StoredRole = parseRoleDefinition(parsed)
        if (parsed.lastExport !== undefined) role.lastExport = parsed.lastExport
        out.push({ uuid: block.uuid, role })
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e)
        throw new Error(
          `Block ${block.uuid} on the ${SCHEMAS_PAGE} page is not a valid schema: ${why}`
        )
      }
    }
    return out
  }
}
