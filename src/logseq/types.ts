/** Structural subset of the `logseq` global used by the adapters, so tests can inject a fake. */
export interface LogseqLike {
  Editor: {
    getPage(name: string): Promise<{ uuid: string } | null>
    createPage(
      name: string,
      properties?: Record<string, unknown>,
      opts?: { redirect?: boolean }
    ): Promise<{ uuid: string } | null>
    getPageBlocksTree(page: string): Promise<{ uuid: string; content: string }[] | null>
    appendBlockInPage(page: string, content: string): Promise<{ uuid: string } | null>
    updateBlock(uuid: string, content: string): Promise<void>
    removeBlock(uuid: string): Promise<void>
    upsertBlockProperty(block: string, key: string, value: unknown): Promise<void>
  }
  DB: {
    datascriptQuery<T = unknown>(query: string, ...inputs: unknown[]): Promise<T>
  }
}
