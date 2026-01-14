/**
 * Logseq API wrapper module
 * Provides type-safe wrappers around Logseq API calls
 */

export interface BlockEntity {
  uuid: string
  content: string
  properties?: Record<string, unknown>
  parent?: { id: number }
  left?: { id: number }
  format?: string
  page?: { id: number }
}

export interface PageEntity {
  uuid: string
  name: string
  originalName: string
  properties?: Record<string, unknown>
  'journal?': boolean
}

/**
 * Get all pages in the current graph
 */
export async function getAllPages(): Promise<PageEntity[]> {
  const pages = await logseq.Editor.getAllPages()
  return pages as PageEntity[]
}

/**
 * Get a page by name
 */
export async function getPage(pageName: string): Promise<PageEntity | null> {
  const page = await logseq.Editor.getPage(pageName)
  return page as PageEntity | null
}

/**
 * Create a new page
 */
export async function createPage(
  pageName: string,
  properties?: Record<string, unknown>
): Promise<PageEntity | null> {
  const page = await logseq.Editor.createPage(pageName, properties, {
    redirect: false,
  })
  return page as PageEntity | null
}

/**
 * Get page blocks tree
 */
export async function getPageBlocksTree(pageName: string): Promise<BlockEntity[]> {
  const blocks = await logseq.Editor.getPageBlocksTree(pageName)
  return blocks as BlockEntity[]
}

/**
 * Insert a block
 */
export async function insertBlock(
  targetBlock: string,
  content: string,
  options?: { before?: boolean; sibling?: boolean; properties?: Record<string, unknown> }
): Promise<BlockEntity | null> {
  const block = await logseq.Editor.insertBlock(targetBlock, content, options)
  return block as BlockEntity | null
}
