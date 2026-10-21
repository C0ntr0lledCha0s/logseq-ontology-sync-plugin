# Role Builder Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plugin's sync and import machinery with a role builder:
- pick presets from the schema library, merged as a union
- trim classes and properties
- export a `:graph-ontology` EDN file to Downloads
- save roles on a hidden page in the graph

**Architecture:**
- **Pure core** in `src/edn`, `src/library` and `src/role`: EDN model, library parsing, selection, export, conflict checks. Unit-tested with `bun test`.
- **Thin Logseq-facing adapters:** live graph reads, the hidden-page store, file download.
- **Plain-DOM UI** in `src/ui/builder`, following the existing template-string style in `src/ui`.
- All entity creation through the plugin API is removed. The user imports the exported file with Logseq's **Import → EDN to DB Graph**.

**Tech Stack:** Bun, TypeScript (strict), Vite + `vite-plugin-logseq`, `@logseq/libs` 0.3.4, `edn-data` (parse only), ESLint and Prettier.

**Spec:** `docs/superpowers/specs/2026-10-21-role-builder-design.md` (Part 2). Approved mockup: `docs/superpowers/specs/assets/2026-10-21-role-builder-mockup.html`. This plan is Plan B. It consumes Plan A's artifacts (`../logseq-template-graph/docs/superpowers/plans/2026-10-21-schema-library.md`). Until v2.0.0 of the template graph is released, develop against a local `build/schema-library.edn` / `build/schema-presets.edn` from that repo.

## Global Constraints

**Platform and dependencies**
- Logseq DB graphs only, desktop 2.0.x. `@logseq/libs` exactly `0.3.4`.
- Run `bun install` before anything else; existing tests fail only because `node_modules` is missing.

**Library and export format**
- Library source: GitHub repo `C0ntr0lledCha0s/logseq-template-graph`, latest release assets `schema-library.edn` and `schema-presets.edn`.
- Idents are used verbatim from the library: `:schema.class/*`, `:schema.property/*`, `:custom.class/*`, `:custom.property/*`. Never invent, suffix or re-namespace an ident.
- Exports are an EDN map with `:properties`, `:classes`, and `:logseq.db.sqlite.export/export-type :graph-ontology`. They never include `:schema-library/version`.
- Write EDN with this plugin's own writer (Task 2), never `toEDNStringFromSimpleObject`. Keywords, strings, `#uuid` tags, vectors and maps must round-trip exactly.

**Verified import behaviour** (spike, 2026-10-21, logseq/logseq `69da7e2215`)
- Re-importing the same file is a no-op.
- Re-importing with fewer class-properties does NOT remove any; the import is additive.
- A property whose type or cardinality differs from the graph's makes Logseq reject the whole file: "The following imported properties conflict with the current graph".

**Storage**
- Saved roles go on a page titled `Ontology Roles`, hidden via `:logseq.property/hide?` true.
- Role files and role storage use JSON (`role-file` format version `1`).

**Process**
- Commits use conventional commits, e.g. `feat(builder): ...`, `refactor!: ...`.

## Review Focus

1. **A role saved against an older library** can reference classes or properties no longer in the current library. Opening it must keep the role and list the missing idents in a notice, not crash or silently drop them. Test in Task 4 (`missing-idents-reported`).
2. **Unticking every preset that brought in an item the user switched on themselves** must keep that item on, tagged "added by you". Test in Task 4 (`user-on-survives-preset-untick`).
3. **A node property whose target classes are none of the selected classes**: the export drops `:build/property-classes`, so the property links to any page, and the UI says so. Test in Task 5 (`node-targets-filtered-or-dropped`).
4. **Exported classes reference properties only through `:build/properties`** (e.g. `:schema.property/url` on every class). Those properties must be exported too, or the import fails. Test in Task 5 (`build-properties-keys-pulled-in`).
5. **Importing a malformed or foreign role file** (wrong JSON, unknown version) must show an error and change nothing. Test in Task 7 (`rejects-bad-role-file`).

---

## File Structure

| Path | Responsibility |
|---|---|
| `src/edn/value.ts` | EDN value model, `kw()`, map helpers |
| `src/edn/read.ts` | `edn-data` rich parse → EDN model |
| `src/edn/write.ts` | deterministic EDN writer |
| `src/library/types.ts` | `Library`, `ClassDef`, `PropertyDef`, `Preset`, `Ident` |
| `src/library/parse.ts` | library and presets EDN → types (keeps the raw entry for export) |
| `src/library/source.ts` | GitHub latest-release fetch and FileStorage cache |
| `src/role/types.ts` | `RoleDefinition`, `Selection`, `Source`, `StoredRole`, `ExportSnapshot` |
| `src/role/selection.ts` | presets + overrides → `Selection` |
| `src/role/export.ts` | `Selection` → export EDN value, file name |
| `src/role/conflicts.ts` | type/cardinality clashes and removal warnings |
| `src/role/role-file.ts` | role ⇄ JSON file text |
| `src/logseq/live-graph.ts` | read live property schemas via `logseq.DB.datascriptQuery` |
| `src/logseq/role-store.ts` | hidden-page persistence |
| `src/logseq/download.ts` | `downloadText(filename, text)` via Blob + anchor |
| `src/ui/builder/view-model.ts` | `Selection` → render-ready rows and counts (pure) |
| `src/ui/builder/render.ts` | HTML template strings and styles from the view model |
| `src/ui/builder/controller.ts` | state, events, wiring adapters |
| `src/index.ts`, `src/plugin-controller.ts`, `src/settings.ts` | entry, toolbar, commands (rewired) |
| Delete | `src/api/**`, `src/import/**`, `src/sync/**`, `src/sources/**`, `src/marketplace/**`, `src/types/**` (unless Task 1 finds non-legacy uses), `src/ui/main-panel.ts`, legacy parts of `src/ui/components.ts`, `src/parser/{validator,types}.ts`, `tests/{api,import,sync}.test.ts` |
| Keep | `src/utils/logger.ts`, `src/utils/environment.ts` (if still used), `tests/logger.test.ts` |

---

### Task 1: Clear the old machinery and upgrade libs

**Files:** delete as listed above. Modify `package.json` (`@logseq/libs` → `0.3.4`), `src/index.ts`, `src/plugin-controller.ts` (reduce to: register the toolbar button and an `Ontology: Open role builder` command, which opens an empty main UI saying "Role builder loading…"), `README.md`, `CLAUDE.md`. Remove `docs/plugin/{api-spec,technical-spec,edn-parser-analysis}.md` if they only describe removed code; keep `native-edn-import-research.md`.

**Interfaces:** Produces `PluginController.openBuilder(): Promise<void>` (Task 8 fills it in).

- [ ] **Step 1:** `bun install`, then `bun add @logseq/libs@0.3.4`.
- [ ] **Step 2:** Delete the files. Remove the `EditorWithIcon` / `EditorWithProps` / `EditorWithTags` casts with their files.
- [ ] **Step 3:** Run `bun run typecheck && bun run lint && bun test`. Expected: all pass (logger and parser tests only).
- [ ] **Step 4:** Run `bun run build`. Expected: `dist/` builds.
- [ ] **Step 5:** Commit `refactor!: remove sync, import and API-create machinery`.

### Task 2: EDN model, reader and writer

**Files:** Create `src/edn/value.ts`, `src/edn/read.ts`, `src/edn/write.ts`; delete `src/parser/` and `tests/parser.test.ts` (superseded). Test `tests/edn.test.ts`.

**Interfaces:**
- Produces:
  - `type EdnValue = string | number | boolean | null | EdnKeyword | EdnUuid | EdnValue[] | EdnMap`, where `EdnKeyword = { kw: string }` (name without the leading colon, e.g. `'schema.class/Person'`), `EdnUuid = { uuid: string }`, and `EdnMap = Map<EdnValue, EdnValue>` (insertion-ordered; keyword keys are interned by `kw()` so `Map#get(kw('a'))` works).
  - `kw(name: string): EdnKeyword` (interned), `isKw(v, name?)`, `mapGet(m: EdnMap, key: string): EdnValue | undefined` (key is a keyword name).
  - `readEdn(text: string): EdnValue`. Uses `parseEDNString(text)` from `edn-data` with default rich options, converting its keyword, map, vector, list and `#uuid` tagged forms. Lists become arrays. Any other tag throws `Error('Unsupported EDN tag: ' + tag)`.
  - `writeEdn(v: EdnValue): string`. Deterministic output with map entries in insertion order. Strings are escaped (`"`, `\`, newline). No namespace-map literals.

- [ ] **Step 1: Failing tests:**
  - `round-trips-library-entry`: read this text, write it, read again, and expect deep equality:
    ```
    {:schema.property/spouse {:db/cardinality :db.cardinality/one :logseq.property/type :node :block/title "spouse" :build/property-classes [:schema.class/Person] :build/properties {:logseq.property/icon {:id "people_hugging" :type :emoji} :logseq.property/description "A \"quoted\"\nline"}}}
    ```
  - `writes-uuid-tag`: `writeEdn({uuid:'67cfe8f6-6242-4a22-b196-8f6b95e96d8a'})` → `#uuid "67cfe8f6-6242-4a22-b196-8f6b95e96d8a"`.
  - `keyword-interning`: `kw('a') === kw('a')`.
  - `rejects-unknown-tag`: `readEdn('#inst "2020-01-01"')` throws `Unsupported EDN tag`.
  - `reads-namespace-map-literal-or-throws`: assert whichever behaviour `edn-data` has for `#:a{:b 1}`, either `{:a/b 1}` or a clear error. Plan A guarantees the library never contains these.
- [ ] **Step 2:** Run `bun test tests/edn.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the three files.
- [ ] **Step 4:** Run `bun test tests/edn.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(edn): add EDN model with exact round-trip writer`.

### Task 3: Library and presets parsing

**Files:** Create `src/library/types.ts`, `src/library/parse.ts`. Test `tests/library.test.ts` with fixture `tests/fixtures/library.edn` and `tests/fixtures/presets.edn`. The fixtures hold a small hand-written library:
- classes: Thing (props `url`, `name`), Person (extends Thing; `email`, `spouse`, `worksFor`), Organization (extends Thing; `legalName`, `email`), Event (extends Thing; `organizer`), BusinessMeeting (extends Event)
- `custom.property/areas` on Organization
- presets: `crm` (Person: email, worksFor; Organization: legalName, email, custom areas) and `events` (Event: organizer; Person: email)

**Interfaces:**
- Produces:
  - `type Ident = string` (keyword name, e.g. `'schema.class/Person'`).
  - `ClassDef { ident; title; parents: Ident[]; properties: Ident[]; raw: EdnMap }`.
  - `PropertyDef { ident; title; type: string; cardinality: 'one'|'many'; targetClasses: Ident[]; raw: EdnMap }`.
  - `Library { version: string; classes: Map<Ident, ClassDef>; properties: Map<Ident, PropertyDef> }`.
  - `Preset { id; name; description; classes: Map<Ident, Ident[]> }`.
  - `parseLibrary(text: string): Library`.
  - `parsePresets(text: string): { version: string; presets: Preset[] }`.
  - `ancestors(lib: Library, cls: Ident): Ident[]` (nearest first, cycle-safe).

- [ ] **Step 1: Failing tests:**
  - `parses-classes-and-parents`: Person parents `['schema.class/Thing']`.
  - `parses-property-schema`: spouse `type 'node'`, `cardinality 'one'`, `targetClasses ['schema.class/Person']`.
  - `ancestors-of-business-meeting`: `['schema.class/Event','schema.class/Thing']`.
  - `parses-presets`: `crm` Person → `['schema.property/email','schema.property/worksFor']`.
  - `version-read`: from `:schema-library/version`.
  - `missing-version-throws`.
- [ ] **Step 2:** Run `bun test tests/library.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test tests/library.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(library): parse schema library and presets`.

### Task 4: Selection model

**Files:** Create `src/role/types.ts`, `src/role/selection.ts`. Test `tests/selection.test.ts` (uses Task 3 fixtures).

**Interfaces:**
- Produces:
  - `type Source = { kind: 'preset'; id: string } | { kind: 'user' } | { kind: 'parent' }`.
  - `RoleDefinition { name: string; libraryVersion: string; presets: string[]; classOverrides: Record<Ident, 'on'|'off'>; propertyOverrides: Record<string /* `${classIdent}|${propIdent}` */, 'on'|'off'> }`.
  - `PropertySelection { ident; on: boolean; sources: Source[]; userOverride?: 'on'|'off' }`.
  - `ClassSelection { ident; on: boolean; sources: Source[]; userOverride?: 'on'|'off'; properties: PropertySelection[] }`. This lists every direct property of the class from the library, including ones not on.
  - `Selection { classes: Map<Ident, ClassSelection>; missing: Ident[] }`.
  - `computeSelection(lib: Library, presets: Preset[], role: RoleDefinition): Selection`.

**Rules (decided here):**
- **Classes:** a class is in the Selection if any selected preset lists it, a class override says `on`, or it is an ancestor of an included class. Ancestors get source `parent`.
- **Properties:** a property is on when a selected preset lists it under that class, unless an override exists; the override always wins.
- **Parents' properties:** a parent's own properties are off unless some preset or override turns them on.
- **Switched-off classes:** a class override `off` keeps the class in the Selection (listed, switched off). Its parent links are still followed only for classes that are on.
- **Missing idents:** override or preset idents not in the library go into `missing`; nothing throws.

- [ ] **Step 1: Failing tests:**
  - `union-of-presets`: crm+events gives Person email (sources crm, events), worksFor (crm), Event organizer (events), Thing as parent.
  - `property-override-off`: `propertyOverrides['schema.class/Person|schema.property/email']='off'` → off, sources still `[crm, events]`.
  - `user-on-survives-preset-untick`: presets `[]` with override Person|spouse `on` and class override Person `on` → Person and spouse on, with source `user`.
  - `parent-properties-default-off`: Thing url off unless overridden.
  - `class-off-kept-listed`: Organization override `off` → present with `on: false`, sources keep crm.
  - `missing-idents-reported`: override for `schema.class/Gone` → `missing` contains it.
- [ ] **Step 2:** Run `bun test tests/selection.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test tests/selection.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(role): compute role selection from presets and overrides`.

### Task 5: Export

**Files:** Create `src/role/export.ts`. Test `tests/export.test.ts`.

**Interfaces:**
- Consumes: `Library`, `Selection`, `writeEdn`, `readEdn`.
- Produces:
  - `buildExport(lib: Library, sel: Selection): { edn: EdnMap; notes: string[] }`.
  - `exportFileName(roleName: string): string` (lower-case, spaces → `-`, non-`[a-z0-9-]` removed, + `.edn`; an empty result becomes `role.edn`).
  - `ExportSnapshot { properties: Record<Ident, { type: string; cardinality: 'one'|'many' }>; classProperties: Record<Ident, Ident[]> }` and `snapshotOf(lib, sel): ExportSnapshot`.

**Rules:**
- **Classes:** export every class that is on, plus ancestors of on-classes, using each class's raw map with `:build/class-properties` replaced by its on-properties in library order.
- **Properties:** export every property that is on for at least one exported class, plus every property ident used as a key in `:build/properties` of any exported class or property (e.g. `schema.property/url`).
- **Node targets:** for a node property, filter `:build/property-classes` to exported classes. If none remain, remove the key and add a note `"<title> will link to any page"`.
- **Header:** add `:logseq.db.sqlite.export/export-type :graph-ontology`. Never add `:schema-library/version`.

- [ ] **Step 1: Failing tests:**
  - `exports-trimmed-class-properties`: Person with only email on → `:build/class-properties [:schema.property/email]`.
  - `ancestors-exported`: Thing present when Person is on.
  - `build-properties-keys-pulled-in`: a fixture class carrying `:schema.property/url` in `:build/properties` → `schema.property/url` exported even though no class has it on.
  - `node-targets-filtered-or-dropped`: worksFor targets Organization. With Organization off, the key is removed and the note mentions worksFor; with it on, the targets equal `[:schema.class/Organization]`.
  - `no-version-key`.
  - `output-round-trips`: `readEdn(writeEdn(edn))` deep-equals `edn`.
  - `file-name`: `exportFileName('Client Work!')` = `client-work.edn`.
- [ ] **Step 2:** Run `bun test tests/export.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `bun test tests/export.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(role): build trimmed graph-ontology export`.

### Task 6: Conflicts, live graph reads and the hidden-page store (needs Logseq for verification)

**Files:** Create `src/role/conflicts.ts`, `src/logseq/live-graph.ts`, `src/logseq/role-store.ts`. Test `tests/conflicts.test.ts` and `tests/role-store.test.ts` (with a fake `logseq` object injected; see interfaces).

**Interfaces:**
- Produces:
  - `typeConflicts(snapshot: ExportSnapshot, live: Map<Ident, { type: string; cardinality: 'one'|'many' }>): { ident: Ident; exported: string; graph: string }[]`. Only idents present in both are compared.
  - `removals(previous: ExportSnapshot | undefined, next: ExportSnapshot): { classes: Ident[]; classProperties: string[] /* class|prop */ }`.
  - `readLivePropertySchemas(api: LogseqLike): Promise<Map<Ident, {type, cardinality}>>`. Uses `api.DB.datascriptQuery('[:find ?ident ?type ?card :where [?p :db/ident ?ident] [?p :logseq.property/type ?type] [?p :db/cardinality ?card]]')`, keeping idents starting with `schema.` or `custom.` and mapping `db.cardinality/many` to `many`.
  - `StoredRole = RoleDefinition & { lastExport?: ExportSnapshot & { exportedAt: string } }`.
  - `class RoleStore { constructor(api: LogseqLike); load(): Promise<StoredRole[]>; save(role: StoredRole): Promise<void>; remove(name: string): Promise<void> }`.
    - **Storage:** page `Ontology Roles`, one block per role, block content is `JSON.stringify(role)`. `save` replaces the block whose parsed `name` matches, otherwise appends.
    - **Creating the page:** if the page is missing, create it with `api.Editor.createPage('Ontology Roles', {}, { redirect: false })`, then `api.Editor.upsertBlockProperty(page.uuid, ':logseq.property/hide?', true)`.
    - **Errors:** if `upsertBlockProperty` throws, throw `Error('Could not hide the Ontology Roles page: ' + msg)`. No fallback.
  - `type LogseqLike` = the subset of `logseq` used here (`Editor.getPage`, `createPage`, `getPageBlocksTree`, `appendBlockInPage`, `updateBlock`, `removeBlock`, `upsertBlockProperty`; `DB.datascriptQuery`).

- [ ] **Step 1: Failing tests:**
  - `type-conflict-detected`: snapshot `skills: default/one` vs live `number/one` → one conflict.
  - `cardinality-conflict-detected`
  - `absent-in-graph-not-conflict`
  - `removals-listed`: previous has Person|spouse, next lacks it → listed.
  - `store-creates-hidden-page-once`: the fake records `createPage` once and `upsertBlockProperty(uuid, ':logseq.property/hide?', true)`.
  - `store-replaces-by-name`
  - `store-hide-failure-throws`
  - `live-query-mapping`: the fake datascriptQuery returns `[['schema.property/email','default','db.cardinality/one'], ['logseq.property/x', 'default','db.cardinality/one']]` → a map with one entry, email `{type:'default', cardinality:'one'}`. Adjust the fake to the actual return shape found in Step 5.
- [ ] **Step 2:** Run `bun test tests/conflicts.test.ts tests/role-store.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5: Verify in Logseq (user-assisted).**
  - Add a temporary command `Ontology: self-test` that saves a dummy role, reloads it, and logs the live schemas for `schema.property/email`.
  - `bun run deploy`. This copies to `/mnt/c/logseq-plugins/logseq-ontology-sync`; ask the user to load the unpacked plugin in Logseq desktop.
  - Ask the user to run the command in a test graph and confirm three things:
    1. the role survives a plugin reload
    2. searching "Ontology Roles" finds nothing
    3. the logged email schema matches the graph
  - If the page is not hidden, or the query shape differs, fix the adapter and the fake to the observed shape. If hiding is impossible, stop and raise it with the user (spec 2.5).
  - Remove the temporary command.
- [ ] **Step 6:** Commit `feat(role): conflict checks, live schema reads and hidden role store`.

### Task 7: Role files, download and library source

**Files:** Create `src/role/role-file.ts`, `src/logseq/download.ts`, `src/library/source.ts`. Test `tests/role-file.test.ts` and `tests/source.test.ts` (with `fetch` injected).

**Interfaces:**
- Produces:
  - `roleToFile(role: StoredRole): string`, producing `{"format":"ontology-role","version":1,"role":{...RoleDefinition}}`. `lastExport` is NOT included, because it belongs to a graph.
  - `roleFromFile(text: string): RoleDefinition`. Throws `Error('Not an ontology role file')` on bad JSON, a wrong `format`, an unknown `version`, or missing fields.
  - `downloadText(filename: string, text: string, mime = 'application/edn'): void` (Blob, `URL.createObjectURL`, temporary `<a download>` in the plugin iframe, revoke after click).
  - `loadLibrary(deps: { fetch: typeof fetch; storage: { getItem(k): Promise<string|undefined>; setItem(k, v): Promise<void> } }): Promise<{ library: Library; presets: Preset[]; fromCache: boolean; latestTag: string }>`.
    - Fetches `https://api.github.com/repos/C0ntr0lledCha0s/logseq-template-graph/releases/latest`, then downloads the two assets by name.
    - On success, caches the text under `library.edn`, `presets.edn` and `tag`.
    - On network failure, uses the cache with `fromCache: true`. With no cache, it throws `Error('Schema library unavailable: ' + msg)`.
    - Library and presets versions must match, or it throws.
    - The real storage is `logseq.FileStorage`.
  - `checkForUpdate(currentTag: string, deps): Promise<string | null>` returns the newer tag or null. Only the user's explicit "Update" action replaces the cache (spec 2.1: never update silently). So `loadLibrary` prefers the cache when present, and fetches only when there is no cache or the user asks.

- [ ] **Step 1: Failing tests:**
  - `role-file-round-trip`
  - `rejects-bad-role-file` (cases: not JSON, `format` wrong, `version: 2`)
  - `uses-cache-when-present`
  - `fetches-when-no-cache`
  - `throws-without-cache-offline`
  - `version-mismatch-throws`
  - `update-detected`
- [ ] **Step 2:** Run `bun test tests/role-file.test.ts tests/source.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(role): role files, download and cached library source`.

### Task 8: Builder UI

**Files:** Create `src/ui/builder/view-model.ts`, `src/ui/builder/render.ts`, `src/ui/builder/controller.ts`. Modify `src/plugin-controller.ts` (`openBuilder`), `src/index.ts` (`provideModel` handlers). Test `tests/view-model.test.ts`.

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `toViewModel(lib: Library, presets: Preset[], role: RoleDefinition, sel: Selection): BuilderVM`, where:
    - `BuilderVM { presetChips: { id; name; selected }[]; contents: { ident; title; depth; on; onCount; total }[]; sections: SectionVM[]; totals: { classes; propertiesOn; propertiesTotal }; notices: string[] }`
    - `SectionVM { ident; title; on; tags: TagVM[]; parentTitle?; rows: { ident; title; on; tags: TagVM[]; typeLabel; offByYou: boolean; notInPreset: boolean }[] }`
    - `TagVM { label; kind: 'preset'|'user'|'parent' }`
    - `typeLabel` is the type name, or `→ Organization, Person` for node properties.
  - `renderBuilder(vm: BuilderVM): string` (HTML) and `builderStyles(): string`.
    - Use the Logseq CSS variables as `src/ui` does today.
    - Layout per the approved mockup: presets bar with an add-class search; a sticky contents column; a scrolling sections pane; and Save role, Export EDN, Export role file, Import role file buttons; plus a role picker (saved roles in this graph, plus New).

**Behaviour to wire in `controller.ts`:**
- **Toggles:** a chip click toggles a preset. A class or property toggle writes an override, or removes it when it matches the preset default.
- **Navigation:** clicking a contents entry scrolls to its section. Scroll position highlights the contents entry (IntersectionObserver).
- **Add class:** the search matches titles case-insensitively and adds a class override `on`.
- **Export:**
  1. compute the snapshot
  2. `typeConflicts` with live schemas. If there are any, block the export and list them.
  3. `removals` against `lastExport`. If there are any, show "Re-importing won't remove these from the graph; remove them by hand" with Continue / Cancel.
  4. `downloadText(exportFileName(name), writeEdn(edn))`
  5. save the role with the new `lastExport`
  6. show the hint "Now use Import → EDN to DB Graph"
- **Library notices:** `missing` idents and export `notes` appear in `notices`. Show the library version, and an "Update library" action when `checkForUpdate` finds one.

- [ ] **Step 1: Failing tests** (on `toViewModel` with the fixtures):
  - `counts-per-class`: Person `onCount/total` (`2/3` with crm only).
  - `tags-carry-sources`
  - `off-by-you-flag`
  - `not-in-preset-flag`
  - `node-type-label`: worksFor → `→ Organization`.
  - `contents-depth`: Thing 0, Person 1, BusinessMeeting 2.
  - `totals`
- [ ] **Step 2:** Run `bun test tests/view-model.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the view model, render and controller.
- [ ] **Step 4:** Run `bun test && bun run typecheck && bun run lint && bun run build`. Expected: all pass.
- [ ] **Step 5: Manual check in Logseq (user-assisted).** `bun run deploy`. In a fresh test graph, the user:
  1. opens the builder, ticks CRM and Events, switches `telephone` off on Person, and adds BusinessMeeting
  2. saves and exports, then imports the file via **Import → EDN to DB Graph**, and confirms Person has the expected properties
  3. re-opens the role, adds `foundingDate` on Organization, re-exports and re-imports, and confirms it was added with no duplicates
  4. switches `email` off on Person and exports, and confirms the removal warning appears
- [ ] **Step 6:** Commit `feat(builder): role builder UI`.

### Task 9: Docs and release prep

**Files:** Modify `README.md` (what it does, install, usage flow, the Import → EDN to DB Graph step, limitations: additive re-import and removal by hand), `CLAUDE.md` (new architecture), `package.json` version `0.2.0`, `CHANGELOG` if present.

- [ ] **Step 1:** Write the docs. Verify `grep -rn 'sync engine\|marketplace\|upsertProperty\|createTag' README.md CLAUDE.md docs/plugin` only hits `native-edn-import-research.md`.
- [ ] **Step 2:** Run `bun test && bun run typecheck && bun run lint && bun run build`. Expected: pass.
- [ ] **Step 3:** Commit `docs: describe the role builder`. Open a PR; releasing is the user's call.
