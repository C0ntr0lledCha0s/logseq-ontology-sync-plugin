import type { ClassMatch } from './class-match'
import type { BuilderVM, RowVM, SectionVM, TagVM } from './view-model'

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface ConfirmVM {
  title: string
  lines: string[]
  /** Buttons, in order; `action` is a controller `data-action` name. */
  actions: { action: string; label: string }[]
}

/** Everything around the builder body: header, role picker, banners. */
export interface ChromeVM {
  libraryVersion: string
  updateTag: string | null
  roles: string[]
  /** Name of the open role; null when none is open. */
  roleName: string | null
  dirty: boolean
  creatingRole: boolean
  confirm: ConfirmVM | null
  /** Inline error banner. */
  error: string | null
  /** Short success hint banner. */
  hint: string | null
  addClass: AddClassVM
}

/** State and current matches of the "+ add class…" combobox. */
export interface AddClassVM {
  open: boolean
  query: string
  /** Index into `items` of the keyboard-active entry; -1 for none. */
  active: number
  items: ClassMatch[]
}

/** The combobox popup: empty while closed. Re-rendered on its own while typing. */
export function renderComboList(combo: AddClassVM): string {
  if (!combo.open) return ''
  if (combo.items.length === 0) {
    return '<div class="rb-combo-list" role="listbox"><div class="rb-combo-empty rb-muted">No matching classes</div></div>'
  }
  const items = combo.items
    .map((m, i) => {
      const parent = m.parentTitle
        ? ` <span class="rb-muted rb-combo-sub">extends ${escapeHtml(m.parentTitle)}</span>`
        : ''
      const added = m.selected ? '<span class="rb-muted rb-combo-added">✓ added</span>' : ''
      const cls = `rb-combo-item${i === combo.active ? ' rb-active' : ''}${m.selected ? ' rb-added' : ''}`
      return `<div class="${cls}" role="option" id="rb-combo-opt-${i}" aria-selected="${i === combo.active}" data-action="combo-pick" data-ident="${escapeHtml(m.ident)}" data-combo-index="${i}"><span>${escapeHtml(m.title)}${parent}</span>${added}</div>`
    })
    .join('')
  return `<div class="rb-combo-list" role="listbox">${items}</div>`
}

export function builderStyles(): string {
  return `
.rb { background: var(--rb-bg); color: var(--rb-text); font-family: var(--rb-font);
  width: min(1100px, 94vw); height: calc(100vh - var(--rb-top, 12px) - 12px); border-radius: calc(var(--rb-radius) * 2);
  display: flex; flex-direction: column; margin-top: var(--rb-top, 12px);
  padding: 16px; box-sizing: border-box; font-size: 13px; border: 1px solid var(--rb-border);
  box-shadow: 0 8px 32px rgba(0,0,0,.35); }
.rb * { box-sizing: border-box; }
.rb ::selection { background: var(--rb-selection); }
.rb-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.rb-head h2 { margin: 0; font-size: 16px; }
.rb-muted { color: var(--rb-muted); }
.rb-spacer { flex: 1; }
.rb button, .rb select, .rb input[type=text] { font: inherit; color: var(--rb-text);
  background: var(--rb-panel); border: 1px solid var(--rb-border);
  border-radius: var(--rb-radius); padding: 3px 10px; }
.rb button { cursor: pointer; }
.rb button:hover:not(:disabled), .rb select:hover { background: var(--rb-hover); }
.rb button:disabled { opacity: .5; cursor: default; }
.rb input[type=text]:focus, .rb select:focus, .rb button:focus-visible { outline: 2px solid var(--rb-accent); outline-offset: -1px; }
.rb input[type=checkbox] { accent-color: var(--rb-accent); }
.rb button.rb-primary { background: var(--rb-accent); color: var(--rb-bg); border-color: transparent; }
.rb button.rb-primary:hover:not(:disabled) { background: var(--rb-accent); filter: brightness(1.1); }
.rb-banner { padding: 8px 10px; border-radius: var(--rb-radius); margin-bottom: 8px; border: 1px solid var(--rb-border); }
.rb-banner.rb-error { border-color: #d33; background: #d333; }
.rb-banner.rb-warn { border-color: #d9822b; background: #d9822b22; }
.rb-banner.rb-ok { border-color: #3a9a5b; background: #3a9a5b22; }
.rb-banner ul { margin: 4px 0 6px 18px; padding: 0; }
.rb-banner button { margin-right: 6px; }
.rb-presets { margin-bottom: 10px; line-height: 2.1; }
.rb-label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--rb-muted); }
.rb-chip { border: 1px dashed var(--rb-border) !important; border-radius: 10px !important; padding: 1px 9px !important; color: var(--rb-muted) !important; background: none !important; }
.rb-chip.rb-selected { color: var(--rb-text) !important; border-style: solid !important; border-color: var(--rb-accent) !important; background: var(--rb-selection) !important; }
.rb-body { display: flex; gap: 12px; flex: 1; min-height: 0; }
.rb-toc { width: 210px; flex: none; overflow: auto; line-height: 1.8; }
.rb-toc a { display: block; cursor: pointer; padding: 0 6px; border-radius: var(--rb-radius); white-space: nowrap; }
.rb-toc a:hover { background: var(--rb-hover); }
.rb-toc a.rb-active { background: var(--rb-active); font-weight: 600; }
.rb-toc a.rb-off { opacity: .45; text-decoration: line-through; }
.rb-count { font-size: 11px; color: var(--rb-muted); }
.rb-pane { flex: 1; overflow: auto; border-left: 1px solid var(--rb-border); padding-left: 12px; }
.rb-toc, .rb-pane, .rb-combo-list { scrollbar-width: thin; scrollbar-color: var(--rb-border) transparent; }
.rb-toc::-webkit-scrollbar, .rb-pane::-webkit-scrollbar, .rb-combo-list::-webkit-scrollbar { width: 8px; height: 8px; }
.rb-toc::-webkit-scrollbar-track, .rb-pane::-webkit-scrollbar-track, .rb-combo-list::-webkit-scrollbar-track { background: transparent; }
.rb-toc::-webkit-scrollbar-thumb, .rb-pane::-webkit-scrollbar-thumb, .rb-combo-list::-webkit-scrollbar-thumb { background: var(--rb-border); border-radius: 4px; }
.rb-combo { position: relative; display: inline-block; }
.rb-combo-pop { position: absolute; top: 100%; left: 0; z-index: 10; min-width: 280px; line-height: 1.5; }
.rb-combo-list { max-height: 280px; overflow-y: auto; background: var(--rb-panel); border: 1px solid var(--rb-border);
  border-radius: var(--rb-radius); font-family: var(--rb-font); box-shadow: 0 6px 20px rgba(0,0,0,.3); padding: 2px; }
.rb-combo-item { display: flex; justify-content: space-between; gap: 12px; padding: 2px 8px; cursor: pointer; border-radius: var(--rb-radius); }
.rb-combo-item:hover, .rb-combo-item.rb-active { background: var(--rb-hover); }
.rb-combo-item.rb-added { opacity: .6; }
.rb-combo-sub, .rb-combo-added { font-size: 11px; white-space: nowrap; }
.rb-combo-empty { padding: 4px 8px; }
.rb-section { border-top: 2px solid var(--rb-accent); padding: 6px 0 12px; }
.rb-section.rb-off-section { opacity: .55; }
.rb-section h3 { margin: 0 0 4px; font-size: 15px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.rb-tag { padding: 0 6px; border-radius: 8px; font-size: 11px; }
.rb-tag.rb-user { border: 1px solid var(--rb-muted); }
.rb-tag.rb-parent { color: var(--rb-muted); border: 1px solid var(--rb-border); }
.rb-table { width: 100%; border-collapse: collapse; }
.rb-table td { padding: 2px 6px 2px 0; vertical-align: top; }
.rb-row-off { opacity: .45; }
.rb-footer { display: flex; gap: 8px; justify-content: flex-end; align-items: center; margin-top: 10px; flex-wrap: wrap; }
.rb-notices { font-size: 12px; margin-bottom: 8px; color: var(--rb-muted); }
.rb-empty { padding: 24px 0; }
`
}

function hueOf(label: string): number {
  let h = 0
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

function renderTag(tag: TagVM): string {
  const style =
    tag.kind === 'preset'
      ? ` style="background:hsl(${hueOf(tag.label)} 65% var(--rb-tag-l, 55%) / var(--rb-tag-a, .3))"`
      : ''
  return `<span class="rb-tag rb-${tag.kind}"${style}>${escapeHtml(tag.label)}</span>`
}

function renderRow(cls: string, row: RowVM): string {
  const note = row.offByYou ? ' · <em>switched off by you</em>' : ''
  const link = row.linksToAnyPage ? ' · <em>will link to any page (targets not selected)</em>' : ''
  const middle = row.notInPreset
    ? '<span class="rb-count">not in a selected preset</span>'
    : row.tags.map(renderTag).join(' ')
  return `<tr class="${row.on ? '' : 'rb-row-off'}">
    <td><label><input type="checkbox" data-change="toggle-prop" data-class="${escapeHtml(cls)}" data-prop="${escapeHtml(row.ident)}"${row.on ? ' checked' : ''}> ${escapeHtml(row.title)}</label></td>
    <td>${middle}</td>
    <td class="rb-muted">${escapeHtml(row.typeLabel)}${note}${link}</td>
  </tr>`
}

function renderSection(section: SectionVM): string {
  const parent = section.parentTitle
    ? `<span class="rb-muted" style="font-size:11px">· extends ${escapeHtml(section.parentTitle)}</span>`
    : ''
  return `<div class="rb-section${section.on ? '' : ' rb-off-section'}" data-section="${escapeHtml(section.ident)}">
    <h3><label><input type="checkbox" data-change="toggle-class" data-class="${escapeHtml(section.ident)}"${section.on ? ' checked' : ''}> ${escapeHtml(section.title)}</label>
      ${section.tags.map(renderTag).join(' ')} ${parent}</h3>
    <table class="rb-table">${section.rows.map((r) => renderRow(section.ident, r)).join('')}</table>
  </div>`
}

function renderConfirm(confirm: ConfirmVM): string {
  return `<div class="rb-banner rb-warn"><strong>${escapeHtml(confirm.title)}</strong>
    <ul>${confirm.lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>
    ${confirm.actions.map((a) => `<button type="button" data-action="${escapeHtml(a.action)}">${escapeHtml(a.label)}</button>`).join('')}
  </div>`
}

function renderHeader(chrome: ChromeVM, summary: string): string {
  const options = chrome.roles
    .map(
      (n) =>
        `<option value="${escapeHtml(n)}"${n === chrome.roleName ? ' selected' : ''}>${escapeHtml(n)}</option>`
    )
    .join('')
  const picker = `<select data-change="switch-role" title="Saved roles in this graph">
      ${chrome.roleName === null ? '<option value="" selected>Choose a role…</option>' : ''}${options}
      <option value="__new__">New role…</option></select>`
  const newRole = chrome.creatingRole
    ? `<span><input type="text" id="rb-new-role" data-enter="create-role" placeholder="Role name" autocomplete="off">
        <button type="button" data-action="create-role">Create</button>
        <button type="button" data-action="cancel-new-role">Cancel</button></span>`
    : ''
  const update = chrome.updateTag
    ? `<button type="button" class="rb-primary" data-action="update-library">Update library to ${escapeHtml(chrome.updateTag)}</button>`
    : `<button type="button" data-action="update-library" title="Fetch the latest schema library">Update library</button>`
  return `<div class="rb-head">
    <h2>Role builder</h2>${picker}${newRole}
    <span class="rb-muted">${escapeHtml(summary)}${chrome.dirty ? ' · unsaved changes' : ''}</span>
    <span class="rb-spacer"></span>
    <span class="rb-muted">Library ${escapeHtml(chrome.libraryVersion)}</span>${update}
    <button type="button" data-action="close">Close</button>
  </div>
  ${chrome.error ? `<div class="rb-banner rb-error">${escapeHtml(chrome.error)}</div>` : ''}
  ${chrome.hint ? `<div class="rb-banner rb-ok">${escapeHtml(chrome.hint)}</div>` : ''}
  ${chrome.confirm ? renderConfirm(chrome.confirm) : ''}`
}

function renderFooter(canAct: boolean): string {
  const dis = canAct ? '' : ' disabled'
  return `<div class="rb-footer">
    <button type="button" data-action="import-role">Import role file</button>
    <input type="file" accept=".json" data-change="import-file" hidden>
    <button type="button" data-action="export-role"${dis}>Export role file</button>
    <button type="button" data-action="save"${dis}>Save role</button>
    <button type="button" class="rb-primary" data-action="export"${dis}>Export EDN ⬇</button>
  </div>`
}

function wrap(inner: string): string {
  return `<style>${builderStyles()}</style><div class="rb">${inner}</div>`
}

/** The builder for an open role. */
export function renderBuilder(vm: BuilderVM, chrome: ChromeVM): string {
  const summary = `${vm.totals.classes} classes · ${vm.totals.propertiesOn} of ${vm.totals.propertiesTotal} properties on`
  const chips = vm.presetChips
    .map(
      (c) =>
        `<button type="button" class="rb-chip${c.selected ? ' rb-selected' : ''}" data-action="toggle-preset" data-id="${escapeHtml(c.id)}">${c.selected ? '✓ ' : ''}${escapeHtml(c.name)}</button>`
    )
    .join(' ')
  const toc = vm.contents
    .map(
      (c) =>
        `<a data-action="goto" data-class="${escapeHtml(c.ident)}" class="${c.on ? '' : 'rb-off'}" style="padding-left:${6 + c.depth * 14}px">${escapeHtml(c.title)} <span class="rb-count">${c.onCount}/${c.total}</span></a>`
    )
    .join('')
  const notices =
    vm.notices.length > 0
      ? `<div class="rb-notices">${vm.notices.map((n) => `<div>${escapeHtml(n)}</div>`).join('')}</div>`
      : ''
  return wrap(`${renderHeader(chrome, summary)}
    <div class="rb-presets"><span class="rb-label">Start from presets</span> ${chips}
      <span class="rb-combo"><input type="text" id="rb-add-class" role="combobox" aria-expanded="${chrome.addClass.open}" aria-controls="rb-combo-pop" placeholder="+ add class…" style="width:170px" autocomplete="off" value="${escapeHtml(chrome.addClass.query)}"><div class="rb-combo-pop" id="rb-combo-pop">${renderComboList(chrome.addClass)}</div></span>
      <button type="button" data-action="add-class">Add</button></div>
    ${notices}
    <div class="rb-body">
      <div class="rb-toc"><div class="rb-label">Contents</div>${toc}</div>
      <div class="rb-pane">${vm.sections.length > 0 ? vm.sections.map(renderSection).join('') : '<div class="rb-empty rb-muted">Pick a preset or add a class to start.</div>'}</div>
    </div>
    ${renderFooter(true)}`)
}

/** Shown when no role is open yet (and while errors need the user's attention). */
export function renderEmpty(chrome: ChromeVM, message: string): string {
  return wrap(`${renderHeader(chrome, '')}
    <div class="rb-empty rb-muted">${escapeHtml(message)}</div>
    ${renderFooter(false)}`)
}

/** Shown when the library cannot be loaded. */
export function renderLibraryError(message: string, updating: boolean): string {
  return wrap(`<div class="rb-head"><h2>Role builder</h2><span class="rb-spacer"></span>
      <button type="button" data-action="close">Close</button></div>
    <div class="rb-banner rb-error">${escapeHtml(message)}</div>
    <div><button type="button" class="rb-primary" data-action="update-library"${updating ? ' disabled' : ''}>${updating ? 'Updating…' : 'Update library'}</button></div>`)
}

export function renderLoading(): string {
  return wrap('<div class="rb-empty rb-muted">Loading the schema library…</div>')
}
