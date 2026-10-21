import { writeEdn } from '../../edn/write'
import { checkForUpdate, loadLibrary, refreshLibrary, type SourceDeps } from '../../library/source'
import type { Library, Preset } from '../../library/types'
import { downloadText } from '../../logseq/download'
import { readLivePropertySchemas } from '../../logseq/live-graph'
import { RoleStore, type StoredRole } from '../../logseq/role-store'
import type { LogseqLike } from '../../logseq/types'
import { removals, typeConflicts } from '../../role/conflicts'
import { buildExport, exportFileName, snapshotOf } from '../../role/export'
import { roleFromFile, roleNameError, roleToFile } from '../../role/role-file'
import { computeSelection } from '../../role/selection'
import type { RoleDefinition } from '../../role/types'
import { setClass, setProperty, togglePreset } from './overrides'
import {
  renderBuilder,
  renderEmpty,
  renderLibraryError,
  renderLoading,
  type ChromeVM,
  type ConfirmVM,
} from './render'
import { toViewModel } from './view-model'

export interface BuilderDeps {
  api: LogseqLike
  source: SourceDeps
  showMsg: (message: string, kind?: 'success' | 'warning' | 'error') => Promise<void> | void
  close: () => void
  /** Identifies the graph currently open in Logseq (its path). */
  currentGraph: () => Promise<string>
}

const CANCEL = { action: 'confirm-cancel', label: 'Cancel' }

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Owns the builder state and wires DOM events (delegated from the root) to it. */
export class BuilderController {
  private readonly store: RoleStore
  private library: Library | null = null
  private presets: Preset[] = []
  private libraryTag = ''
  private updateTag: string | null = null
  private libraryError: string | null = null
  private updating = false

  private roles: StoredRole[] = []
  private role: StoredRole | null = null
  private dirty = false
  private creatingRole = false
  private confirm: ConfirmVM | null = null
  private error: string | null = null
  private hint: string | null = null
  private exportNotes: string[] = []
  private pendingExport: {
    role: StoredRole
    snapshot: ReturnType<typeof snapshotOf>
    file: string
    text: string
  } | null = null
  private pendingImport: RoleDefinition | null = null
  private busy = false
  private graphId: string | null = null
  private afterDiscard: (() => Promise<void> | void) | null = null

  private observer: IntersectionObserver | null = null
  private listening = false

  constructor(
    private readonly root: HTMLElement,
    private readonly deps: BuilderDeps
  ) {
    this.store = new RoleStore(deps.api)
  }

  /** Show the builder, loading the library and saved roles. Safe to call repeatedly. */
  async open(): Promise<void> {
    this.attachListeners()
    this.root.innerHTML = renderLoading()
    this.error = null
    this.hint = null
    const switched = await this.syncGraph()
    try {
      const loaded = await loadLibrary(this.deps.source)
      this.setLibrary(loaded.library, loaded.presets, loaded.latestTag)
      this.libraryError = null
    } catch (e) {
      this.libraryError = errorText(e)
      this.render()
      return
    }
    try {
      this.roles = await this.store.load()
    } catch (e) {
      this.error = errorText(e)
    }
    if (switched) {
      this.role = this.firstRole()
    } else if (this.role && !this.dirty) {
      // Re-take the stored copy so lastExport is fresh.
      const name = this.role.name
      const stored = this.roles.find((r) => r.name === name)
      this.role = stored ? structuredClone(stored) : this.firstRole()
    } else {
      // Keep an open role and its unsaved edits across close and reopen.
      this.role ??= this.firstRole()
    }
    this.render()
    void checkForUpdate(this.libraryTag, this.deps.source).then((tag) => {
      this.updateTag = tag
      if (tag && this.library) this.render()
    })
  }

  /** Called when Logseq switches graphs: drops the previous graph's role state. */
  async onGraphChanged(): Promise<void> {
    if (!(await this.syncGraph())) return
    try {
      await this.reloadRoles()
    } catch (e) {
      this.error = errorText(e)
    }
    this.role = this.firstRole()
    if (this.library !== null) this.render()
  }

  /** Records the current graph; true (after resetting role state) when it differs from the last. */
  private async syncGraph(): Promise<boolean> {
    const current = await this.deps.currentGraph()
    const changed = this.graphId !== null && this.graphId !== current
    this.graphId = current
    if (!changed) return false
    const lostEdits = this.dirty
    this.role = null
    this.roles = []
    this.dirty = false
    this.creatingRole = false
    this.clearConfirm()
    this.exportNotes = []
    this.hint = null
    this.error = null
    if (lostEdits) {
      await this.deps.showMsg(
        'Unsaved changes to a role in the previous graph were discarded.',
        'warning'
      )
    }
    return true
  }

  private setLibrary(library: Library, presets: Preset[], tag: string): void {
    this.library = library
    this.presets = presets
    this.libraryTag = tag
    this.updateTag = null
  }

  // ---- rendering -------------------------------------------------------------------------

  private chrome(): ChromeVM {
    const library = this.requireLibrary()
    return {
      libraryVersion: library.version,
      updateTag: this.updateTag,
      roles: this.roles.map((r) => r.name),
      roleName: this.role?.name ?? null,
      dirty: this.dirty,
      creatingRole: this.creatingRole,
      confirm: this.confirm,
      error: this.error,
      hint: this.hint,
      classNames: [...library.classes.values()].map((c) => c.title),
    }
  }

  private requireLibrary(): Library {
    if (!this.library) throw new Error('Library is not loaded')
    return this.library
  }

  private render(): void {
    const pane = this.root.querySelector<HTMLElement>('.rb-pane')
    const toc = this.root.querySelector<HTMLElement>('.rb-toc')
    const scroll = { pane: pane?.scrollTop ?? 0, toc: toc?.scrollTop ?? 0 }
    this.observer?.disconnect()
    this.observer = null

    if (this.libraryError !== null) {
      this.root.innerHTML = renderLibraryError(this.libraryError, this.updating)
      return
    }
    const library = this.requireLibrary()
    const chrome = this.chrome()
    if (!this.role) {
      this.root.innerHTML = renderEmpty(
        chrome,
        'No role open. Choose "New role…" or import a role file to begin.'
      )
      return
    }
    const sel = computeSelection(library, this.presets, this.role)
    const vm = toViewModel(library, this.presets, this.role, sel)
    if (this.role.libraryVersion !== library.version) {
      vm.notices.push(
        `This role was saved against library ${this.role.libraryVersion}; the loaded library is ${library.version}.`
      )
    }
    vm.notices.push(...this.exportNotes)
    this.root.innerHTML = renderBuilder(vm, chrome)

    const newPane = this.root.querySelector<HTMLElement>('.rb-pane')
    const newToc = this.root.querySelector<HTMLElement>('.rb-toc')
    if (newPane) newPane.scrollTop = scroll.pane
    if (newToc) newToc.scrollTop = scroll.toc
    this.observeSections(newPane)
  }

  private observeSections(pane: HTMLElement | null): void {
    if (!pane || typeof IntersectionObserver === 'undefined') return
    const sections = [...pane.querySelectorAll<HTMLElement>('[data-section]')]
    const visible = new Set<string>()
    const highlight = (): void => {
      const active = sections.find((s) => visible.has(s.dataset.section ?? ''))?.dataset.section
      this.root.querySelectorAll<HTMLElement>('.rb-toc a').forEach((a) => {
        a.classList.toggle('rb-active', a.dataset.class === active)
      })
    }
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.section ?? ''
          if (entry.isIntersecting) visible.add(id)
          else visible.delete(id)
        }
        highlight()
      },
      { root: pane, threshold: 0, rootMargin: '0px 0px -60% 0px' }
    )
    for (const s of sections) this.observer.observe(s)
  }

  // ---- event wiring ----------------------------------------------------------------------

  private attachListeners(): void {
    if (this.listening) return
    this.listening = true
    this.root.addEventListener('click', (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]')
      if (el) this.run(this.onAction(el.dataset.action ?? '', el))
    })
    this.root.addEventListener('change', (ev) => {
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-change]')
      if (el) this.run(this.onChange(el.dataset.change ?? '', el))
    })
    this.root.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return
      const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-enter]')
      if (el) this.run(this.onAction(el.dataset.enter ?? '', el))
    })
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return
      const target = ev.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      this.deps.close()
    })
  }

  /** Runs a handler; any failure is shown in the panel rather than lost. */
  private run(task: Promise<void>): void {
    task.catch((e: unknown) => {
      this.error = errorText(e)
      if (this.libraryError !== null) this.libraryError = errorText(e)
      this.updating = false
      this.render()
    })
  }

  private async onAction(action: string, el: HTMLElement): Promise<void> {
    switch (action) {
      case 'close':
        this.deps.close()
        return
      case 'update-library':
        await this.updateLibrary()
        return
      case 'toggle-preset':
        this.edit((_lib, role) => togglePreset(role, el.dataset.id ?? ''))
        return
      case 'goto':
        this.goto(el.dataset.class ?? '')
        return
      case 'add-class':
        this.addClass()
        return
      case 'save':
        await this.exclusive(() => this.saveRole())
        return
      case 'export':
        await this.exclusive(() => this.startExport())
        return
      case 'export-continue':
        await this.exclusive(() => this.finishExport())
        return
      case 'export-role':
        this.exportRoleFile()
        return
      case 'import-role':
        this.root.querySelector<HTMLInputElement>('input[type=file]')?.click()
        return
      case 'create-role':
        await this.createRole()
        return
      case 'cancel-new-role':
        this.creatingRole = false
        this.render()
        return
      case 'confirm-cancel':
        this.clearConfirm()
        this.exportNotes = []
        this.render()
        return
      case 'import-replace': {
        const definition = this.pendingImport
        this.clearConfirm()
        if (definition) await this.saveImported(definition)
        return
      }
      case 'discard-continue': {
        const next = this.afterDiscard
        this.clearConfirm()
        this.dirty = false
        if (next) await next()
        return
      }
      default:
        throw new Error(`Unknown action: ${action}`)
    }
  }

  private async onChange(change: string, el: HTMLElement): Promise<void> {
    const input = el as HTMLInputElement
    switch (change) {
      case 'toggle-class': {
        const cls = el.dataset.class ?? ''
        this.edit((lib, role) => setClass(lib, this.presets, role, cls, input.checked))
        return
      }
      case 'toggle-prop': {
        const cls = el.dataset.class ?? ''
        const prop = el.dataset.prop ?? ''
        this.edit((lib, role) => setProperty(lib, this.presets, role, cls, prop, input.checked))
        return
      }
      case 'switch-role': {
        const value = (el as HTMLSelectElement).value
        if (value === '__new__') {
          this.creatingRole = true
          this.render()
          this.root.querySelector<HTMLInputElement>('#rb-new-role')?.focus()
          return
        }
        await this.guardDirty(() => this.openRole(value))
        return
      }
      case 'import-file':
        await this.importRoleFile(input)
        return
      default:
        throw new Error(`Unknown change: ${change}`)
    }
  }

  // ---- state changes ---------------------------------------------------------------------

  private clearConfirm(): void {
    this.confirm = null
    this.pendingExport = null
    this.pendingImport = null
    this.afterDiscard = null
  }

  private edit(change: (lib: Library, role: RoleDefinition) => RoleDefinition): void {
    if (!this.role) throw new Error('No role is open')
    this.role = { ...this.role, ...change(this.requireLibrary(), this.role) }
    this.dirty = true
    this.clearConfirm()
    this.hint = null
    this.error = null
    this.exportNotes = []
    this.render()
  }

  private openRole(name: string): void {
    const found = this.roles.find((r) => r.name === name)
    this.role = found ? structuredClone(found) : null
    this.dirty = false
    this.creatingRole = false
    this.clearConfirm()
    this.exportNotes = []
    this.hint = null
    this.error = null
    this.render()
  }

  /** Runs `next` now, or after the user agrees to discard unsaved changes. */
  private async guardDirty(next: () => Promise<void> | void): Promise<void> {
    if (!this.dirty) {
      await next()
      return
    }
    this.afterDiscard = next
    this.confirm = {
      title: 'You have unsaved changes',
      lines: ['Continuing discards the unsaved changes to this role.'],
      actions: [{ action: 'discard-continue', label: 'Discard and continue' }, CANCEL],
    }
    this.render()
  }

  private firstRole(): StoredRole | null {
    const first = this.roles[0] as StoredRole | undefined
    return first ? structuredClone(first) : null
  }

  private async reloadRoles(): Promise<void> {
    this.roles = await this.store.load()
  }

  private goto(cls: string): void {
    const target = [...this.root.querySelectorAll<HTMLElement>('[data-section]')].find(
      (s) => s.dataset.section === cls
    )
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  private addClass(): void {
    const library = this.requireLibrary()
    const input = this.root.querySelector<HTMLInputElement>('#rb-add-class')
    const query = (input?.value ?? '').trim().toLowerCase()
    if (query === '') return
    const all = [...library.classes.values()]
    const match =
      all.find((c) => c.title.toLowerCase() === query) ??
      all.find((c) => c.title.toLowerCase().startsWith(query)) ??
      all.find((c) => c.title.toLowerCase().includes(query))
    if (!match) {
      this.error = `No class matches "${input?.value ?? ''}"`
      this.render()
      return
    }
    this.edit((lib, role) => setClass(lib, this.presets, role, match.ident, true))
    this.goto(match.ident)
  }

  private async updateLibrary(): Promise<void> {
    this.updating = true
    this.render()
    const fresh = await refreshLibrary(this.deps.source)
    this.updating = false
    this.setLibrary(fresh.library, fresh.presets, fresh.latestTag)
    this.libraryError = null
    this.error = null
    this.clearConfirm()
    this.exportNotes = []
    if (this.roles.length === 0 && this.role === null) {
      try {
        await this.reloadRoles()
      } catch (e) {
        this.error = errorText(e)
      }
      this.role = this.firstRole()
    }
    this.render()
    await this.deps.showMsg(`Schema library updated to ${fresh.library.version}`, 'success')
  }

  private async saveRole(): Promise<void> {
    if (!this.role) throw new Error('No role is open')
    const library = this.requireLibrary()
    this.role = { ...this.role, libraryVersion: library.version }
    await this.store.save(this.role)
    await this.reloadRoles()
    this.dirty = false
    this.error = null
    this.render()
    await this.deps.showMsg(`Saved role "${this.role.name}"`, 'success')
  }

  private async createRole(): Promise<void> {
    const library = this.requireLibrary()
    const name = (this.root.querySelector<HTMLInputElement>('#rb-new-role')?.value ?? '').trim()
    const nameError = roleNameError(name)
    if (nameError) throw new Error(nameError)
    if (this.roles.some((r) => r.name === name)) throw new Error(`A role named "${name}" exists`)
    await this.guardDirty(async () => {
      const fresh: StoredRole = {
        name,
        libraryVersion: library.version,
        presets: [],
        classOverrides: {},
        propertyOverrides: {},
      }
      await this.store.save(fresh)
      await this.reloadRoles()
      this.openRole(name)
    })
  }

  // ---- role files ------------------------------------------------------------------------

  private exportRoleFile(): void {
    if (!this.role) throw new Error('No role is open')
    const base = exportFileName(this.role.name).replace(/\.edn$/, '')
    downloadText(`${base}.ontology-role.json`, roleToFile(this.role), 'application/json')
  }

  private async importRoleFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const definition = roleFromFile(await file.text())
    await this.guardDirty(async () => {
      if (this.roles.some((r) => r.name === definition.name)) {
        this.pendingImport = definition
        this.confirm = {
          title: `A role named "${definition.name}" already exists — replace it?`,
          lines: ["Replacing keeps this graph's export history for that role."],
          actions: [{ action: 'import-replace', label: 'Replace' }, CANCEL],
        }
        this.render()
        return
      }
      await this.saveImported(definition)
    })
  }

  private async saveImported(definition: RoleDefinition): Promise<void> {
    const existing = this.roles.find((r) => r.name === definition.name)
    const stored: StoredRole = existing?.lastExport
      ? { ...definition, lastExport: existing.lastExport }
      : definition
    await this.store.save(stored)
    await this.reloadRoles()
    this.openRole(definition.name)
    await this.deps.showMsg(`Imported role "${definition.name}"`, 'success')
  }

  /** Ignores a second activation while an async action is still running. */
  private async exclusive(task: () => Promise<void>): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      await task()
    } finally {
      this.busy = false
    }
  }

  // ---- EDN export ------------------------------------------------------------------------

  private async startExport(): Promise<void> {
    if (!this.role) throw new Error('No role is open')
    const library = this.requireLibrary()
    const role = this.role
    const sel = computeSelection(library, this.presets, role)
    const snapshot = snapshotOf(library, sel)

    const conflicts = typeConflicts(snapshot, await readLivePropertySchemas(this.deps.api))
    if (conflicts.length > 0) {
      this.confirm = {
        title:
          'Export blocked: these properties already exist in the graph with a different type. Logseq would reject the whole import.',
        lines: conflicts.map(
          (c) =>
            `${library.properties.get(c.ident)?.title ?? c.ident} (${c.ident}): this role exports ${c.exported}, the graph has ${c.graph}`
        ),
        actions: [{ action: 'confirm-cancel', label: 'Close' }],
      }
      this.render()
      return
    }

    const { edn, notes } = buildExport(library, sel)
    this.exportNotes = notes
    this.pendingExport = {
      role,
      snapshot,
      file: exportFileName(role.name),
      text: writeEdn(edn),
    }

    const gone = removals(role.lastExport, snapshot)
    if (gone.classes.length > 0 || gone.classProperties.length > 0) {
      const classTitle = (id: string): string => library.classes.get(id)?.title ?? id
      const lines = [
        ...gone.classes.map((c) => `Class ${classTitle(c)}`),
        ...gone.classProperties.map((k) => {
          const sep = k.indexOf('|')
          const cls = k.slice(0, sep)
          const prop = k.slice(sep + 1)
          return `${classTitle(cls)} › ${library.properties.get(prop)?.title ?? prop}`
        }),
      ]
      this.confirm = {
        title: "Re-importing won't remove these from the graph; remove them by hand.",
        lines,
        actions: [{ action: 'export-continue', label: 'Continue' }, CANCEL],
      }
      this.render()
      return
    }
    await this.finishExport()
  }

  private async finishExport(): Promise<void> {
    const pending = this.pendingExport
    if (!pending) throw new Error('Nothing to export')
    downloadText(pending.file, pending.text)
    this.role = {
      ...pending.role,
      libraryVersion: this.requireLibrary().version,
      lastExport: { ...pending.snapshot, exportedAt: new Date().toISOString() },
    }
    await this.store.save(this.role)
    await this.reloadRoles()
    this.dirty = false
    this.clearConfirm()
    this.error = null
    this.hint = `Exported ${pending.file}. Now use Import → EDN to DB Graph.`
    this.render()
    await this.deps.showMsg(this.hint, 'success')
  }
}
