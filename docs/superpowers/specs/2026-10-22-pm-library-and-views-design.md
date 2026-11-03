# PM Library, Multi-Library Roles and Starter Views: Design

**Date:** 2026-10-22
**Status:** Superseded (2026-11-03). PM shipped in the shared schema library instead: `custom.*` idents in `source/project-management/`, the `project-management` preset, and `views/project-management.edn` (logseq-template-graph#35). Built-in parents in the role builder were fixed in #29. Kept for reference; not planned.
**Repos affected:** `logseq-template-graph` (library side) and `logseq-ontology-sync-plugin` (builder side)
**Builds on:** `2026-10-21-role-builder-design.md` (the role builder) and template-graph v2.0.0 (the schema library)

## Intent

James runs project management (Visions → Objectives → Goals → Ideas → Work Items, plus Decisions, Obstacles and Specs) inside the same Logseq DB graph as his Schema.org-based notes. Agent Deck tracks the same items, and AI agents own some of them. He has drafted a PM schema as an uncommitted module in `logseq-template-graph`, on branch `feat/project-management`. It was written against the pre-v2.0.0 layout:
- the module is `source/project-management/{classes,properties,pages}.edn` plus `README.md`
- the preset is `source/presets/project-management.edn`
- `scripts/build.clj` has a local edit

The PM schema should become a second, curated library next to the Schema.org one. The role builder should let a role draw from either library or both, chosen in a multi-select dropdown. It should also ship the PM starter views (saved queries) in the same export file, because a view only works once its tags exist in the graph.

## Goals

1. **The PM library** is published from logseq-template-graph alongside the Schema.org library. It uses the same workflow: hand-edited EDN, `bb test/build/validate/check-import`, the committed `library/` folder, and a tagged release.
2. **It carries over James's draft.** That means 21 classes and 43 properties with 12 choice lists, `Work Item` extending the built-in `#Task`, and the starter views. Add an **`Agent`** class that extends `schema.class/SoftwareApplication`. `owner` becomes a node property restricted to `schema.class/Person`, `schema.class/Organization` and `pm.class/Agent`.
3. **A libraries index.** The template graph publishes a small index of available libraries, so the plugin picks up new libraries without a code change.
4. **A Libraries dropdown in the builder.** It lists the libraries from the index and lets the user tick any number. The presets bar, contents, sections and the add-class search show only items from ticked libraries. Every class and property shows a library tag. A role remembers its libraries.
5. **Links across libraries just work.** When a ticked library references a class from another library, for example `owner` → `schema.class/Person`, that class is included in the export as a dependency, even if the other library is not ticked. The UI says so.
6. **Choice lists end to end.** The library validates them, the builder shows them on the property row, the export writes them, and conflict checking covers them.
7. **Starter views: the Views tab** (approved mockup option A).
   - The builder gets a "Classes | Views" switch.
   - The Views tab lists views from the ticked libraries.
   - A view can be ticked only when every tag it queries is in the role. Otherwise it shows "needs <Tag>, add to role", with an action that adds the tag.
   - Ticked views are written into the same exported EDN as `:pages-and-blocks`, one page per library (e.g. "PM Views").
   - A role remembers its ticked views.

## Non-goals

- **No "Halted" status.** PM work items use Logseq's built-in Status, Priority and Deadline as they are. Import cannot change built-in properties: tested, Logseq rejects it with "New ident is not allowed to use an internal namespace".
- **No views outside an export:** no separate Views command, and no direct page creation.
- **No agent-specific fields** beyond the `Agent` class and the `owner` range. `decided-by` keeps its choices, which describe how a decision was made.
- **No migration of existing PM data.** The draft was never imported anywhere that matters.

## Anti-goals

- Losing or overwriting James's uncommitted PM work. It lives in his main checkout on an old base. It must be copied into a fresh branch, and his working copy must be left untouched.
- A PM ident colliding with a Schema.org or custom ident.
- An export that references a class or property it doesn't include, other than `logseq.*` built-ins. Logseq's import would reject it.
- A view exported without the tags it queries.

## Verified facts

These were checked on 2026-10-22 with Logseq's own `build-import` and `validate-import-txs`, at logseq/logseq `69da7e2215`, via the template-graph check-import harness:
- **Choice lists import:** `:build/closed-values [{:value "active"} …]` on a `:default` property imports cleanly.
- **Built-in parents import:** `:build/class-extends [:pm.class/PMItem :logseq.class/Task]` imports cleanly.
- **Cross-library links import:** `:pm.property/owner` with `:build/property-classes [:schema.class/Person]` imports cleanly, as long as Person is defined in the same file.
- **Built-in properties can't be changed:** adding a closed value to `:logseq.property/status` is rejected.
- **The draft's views use pages and blocks:** `source/project-management/pages.edn` holds `{:pages-and-blocks [{:page {:block/title "PM Views"} :blocks [...]}]}`. The blocks are tagged `:logseq.class/Query` and carry `:logseq.property/query` with the datalog in the block title. The queries reference the draft's random-suffix `:user.*` idents.
- **Views can share a file with the ontology:** `:pages-and-blocks` inside a `:graph-ontology` export imports cleanly.
- **Re-imported views duplicate unless their IDs are fixed:**
  - Re-importing reuses the page but duplicates its blocks: one query block became two.
  - With a fixed `:block/uuid` plus `:build/keep-uuid? true` on the page and on every view block, re-import is a no-op (the block count stays at 1).
- **Choice lists never change on re-import:** re-importing an existing property with more or fewer `:build/closed-values` leaves its choices exactly as they were. Nothing is added or removed, and there is no error.
- **Earlier findings still apply:** the plugin downloads from `raw.githubusercontent.com/<repo>/<tag>/library/<file>`, which allows cross-origin requests. Re-import is additive. A type or cardinality clash rejects the whole file.

## Design

### Part 1: Template graph

**1.1 Move the draft.**
- Create branch `feat/pm-library` from current `main` in a new worktree.
- Copy James's uncommitted files from the main checkout:
  - `source/project-management/**`
  - `source/presets/project-management.edn`
- Don't modify or clean his checkout.
- Discard his `scripts/build.clj` edit. It targets the old build, and the new build handles pages (1.4).

**1.2 Fixed names.** Convert every `:user.*` ident in the module, including those inside view query strings, to:
- `:pm.class/<Name>`, using the title in PascalCase with spaces removed (`PM Item` → `PMItem`, `Work Item` → `WorkItem`)
- `:pm.property/<name>`, using the existing kebab-case names (`for-goal`, `ad-id`, …)

Keep the titles and all curation as they are. PM entries get no `:schema.property/url`. Write the conversion as a tested one-off, as in Plan A, and remove it afterwards.

How to do the rename:
- **Inside query strings:** replace whole ident tokens only, using an exact old→new map applied with a token regex `:user\.(class|property)/[A-Za-z0-9_-]+`. Never plain substring replacement.
- **Collisions:** the 21 draft class titles are unique. If two names still collapse to the same PascalCase ident, the conversion fails rather than picking one.
- **Abstract classes:** `Container`, `Strategy`, `Governance` and `Direction` are PM classes and part of the 21. The validator should treat the namespace prefix as data: an allow-list of library namespaces from the index, not hard-coded `schema`/`custom`.

**1.3 Additions to the schema.**
- `pm.class/Agent` extends `schema.class/SoftwareApplication` and `pm.class/PMItem`. My call: inheriting PMItem gives an agent an `ad-id`, `owner` and `scope`. Agent Deck agents have IDs.
- `pm.property/owner` becomes `:node`, cardinality one, with `:build/property-classes [:schema.class/Person :schema.class/Organization :pm.class/Agent]`.

**1.4 Library layout.**
- Each library is a directory of modules plus presets:
  - The Schema.org library keeps `source/` as it is.
  - PM lives under `source/project-management/` with `source/presets/project-management.edn`, or as a separate root; the builder chooses.
- `bb build` writes, for each library:
  - `build/<lib>-library.edn`
  - `build/<lib>-presets.edn`
  - `build/<lib>-views.edn` (only if the library has views)
- It also writes `build/libraries.edn`, listing each library: id, name, version, namespaces, file names, and the libraries it depends on.
- Existing file names stay as they are for the Schema.org library (`schema-library.edn`, `schema-presets.edn`), so v2.0.0 consumers keep working.
- `library/` mirrors `build/` as now (`publish-library` / `check-library`).

**1.5 Validation.**
- Every existing check runs per library.
- References across libraries are allowed only to libraries declared as dependencies (PM → schema), and to `logseq.*` built-ins.
- Choice lists: each value is a non-empty string, unique within the property; only `:default` properties may have them.
- Each view's query must reference only idents that exist in its library or its dependencies. Each view declares the tags it needs (1.6).

**1.6 View format.**
- The views file is `{:schema-library/version … :views [{:id "roadmap" :name "Roadmap" :description "…" :requires [:pm.class/Idea :pm.property/idea-stage] :blocks [<pages-and-blocks block maps>]}]}`.
- **`:requires`** lists every class and property the view queries. Built-ins (`:logseq.*`) are not listed. Validation checks it against the query text: every `:pm.*` or `:schema.*` ident in the query must appear in `:requires`, and every listed ident must exist in the library or its dependencies.
- **Fixed IDs:**
  - Each view block, and each library's views page, carries a fixed `:block/uuid` with `:build/keep-uuid? true`, so re-import never duplicates.
  - The UUIDs are deterministic: name-based, from `"<library-id>/<view-id>/<block-index>"` and `"<library-id>/views-page"`, so they stay stable across builds.
  - Validation checks that no two blocks share a UUID.
- The draft's views map to five views: Roadmap, Goal health, Up next, Orphans and Decision log. The draft has 8 query blocks across them.

**1.7 Import check.**
- `check-import` imports each library together with its dependencies, plus all of its views as one page per library, into a fresh graph. It then re-imports and passes only if nothing changed.
- It also imports Schema.org and PM together.

**1.8 Release.**
- Version stays shared: one repo version tags all libraries. My call: simpler than per-library versions. The index records it per library anyway.
- The release becomes **v2.1.0**: additive, with Schema.org file names unchanged. Release assets include every file in `library/`.

### Part 2: Plugin

**2.1 Library source.**
- `loadLibrary` and `refreshLibrary` fetch `library/libraries.edn` at the release tag, then each library's files.
- Cache everything under one cache entry per file, plus the index.
- If the index is missing (a tag before v2.1.0), fall back to the v2.0.0 file names as the single Schema.org library. This is the one allowed fallback, because v2.0.0 exists in the wild.

**2.2 Model.**
- `Library` gains `id` and `name`.
- The plugin holds `Library[]`.
- `ClassDef`, `PropertyDef` and `Preset` carry their `libraryId`.
- `PropertyDef` gains `choices?: string[]`.
- Add a `View` type: `{ id; name; description; requires: Ident[]; blocks: EdnValue[]; libraryId }`.
- `RoleDefinition` gains:
  - `libraries: string[]` (default `['schema']` for new roles and for roles saved before this change)
  - `views: string[]`, as library-qualified view ids
- Role-file format becomes version `2`. The plugin reads version `1` by adding the defaults.

**2.3 Selection and dependencies.**
- Selection runs over classes from the ticked libraries.
- Each node property's target classes, and parent classes, may live in an unticked library. Those classes are pulled in as dependencies with source `dependency` and the tag "needed by <property/class>".
- They export like parents: present, with only their on properties.
- The user cannot switch a dependency off while something needs it. The row shows why.

**2.4 Export.**
- Choice lists are written as `:build/closed-values [{:value …}]`, in library order.
- Ticked views are appended as `:pages-and-blocks`, one page per library named "<Library name> Views".
- A view is exportable only when every class and property in its `:requires` is on in the role. Otherwise it's blocked in the UI and never exported. Views keep their fixed UUIDs from the library.
- The export header stays `:graph-ontology` (verified).

**2.5 Conflict checks.** Add choice lists:
- **Before export:** read the live closed values of exported properties that already exist in the graph.
- **What import does:** it never changes an existing property's choices (verified).
- **So, on export:** if the role's choices differ from the graph's, show a non-blocking warning listing them: "Logseq's import won't change choices on existing properties. Add <x, y> / remove <z> by hand in the property's settings." The export still goes ahead.

**2.6 UI.**
- **Header:**
  - a "Libraries" multi-select dropdown, styled like the add-class combobox and listing name, version and class count
  - a "Classes | Views" switch
- **Classes view:**
  - each class and property shows a library tag
  - property rows with choices show "choices: a, b, c…" after the type
- **Views tab:**
  - views grouped by library, each with a tick box, name and description
  - each view shows the tags it requires as ✓ (in role) or ✗ with an "add to role" action
  - a view with ✗ tags can't be ticked
- **Unticking a library** that the role still uses leaves the role's overrides and its ticked views from that library in place. They're not shown or exported while the library is unticked, a notice says so, and ticking the library again restores them.

**2.6a Dependency details (my calls).**
- **What a dependency brings:** a dependency class pulls in its own parent chain. For example, `Agent` → SoftwareApplication → CreativeWork → Thing, all tagged "dependency". It exports with only the properties that are on, which by default is none. So `owner` → Person exports a Person class with no properties unless the user turns some on.
- **When the dependency's library is ticked:** if the user ticks that library and selects the class, it becomes a normal selected class. The user's overrides on it are kept, and the "dependency" tag drops off while something still needs it.
- **Finding the latest release:** the plugin keeps resolving the latest release via the GitHub API (`releases/latest` → `tag_name`), as now. `libraries.edn` at that tag is the only list of available libraries.
- **Presets belong to a library** by directory. Each library has its own presets directory, so the Schema.org build no longer reads PM presets. The builder updates `presets/read-presets` and the analysis skills accordingly.

**2.7 Notes for the plugin's earlier work.** The role-builder branch (`feat/role-builder`) must merge first. This work builds on it.

## Constraints

- Logseq DB desktop 2.0.x, `@logseq/libs` 0.3.4, Bun/TypeScript for the plugin, Babashka for the template graph.
- Each repo's conventional commits rules apply. The template-graph `validate-commits` type list does not include `ci`.
- Plan A/B conventions continue: fail-fast, pure tested core, and the import checks use Logseq's own code.

## Left to the builder

- The exact directory layout for the PM library inside the template graph (1.4).
- The `libraries.edn` field names.
- How the Views tab draws its required-tag badges.
- The order of work, provided the template graph ships v2.1.0 before the plugin depends on the index (develop against local `build/` files).

## Calls made during brainstorming (for review)

- `pm.class/*` and `pm.property/*` namespaces, with PascalCase class names derived from titles.
- `Agent` also extends PMItem.
- One shared version and a libraries index; the release is v2.1.0.
- New roles default to the Schema.org library only.
- Role-file format version 2, still reading version 1.
- Classes from unticked libraries are pulled in as dependencies when something needs them.
- The index fallback for v2.0.0 tags.
- **Views:** `:requires` covers properties too. View blocks get deterministic fixed UUIDs, so re-import doesn't duplicate them.
- **Choice-list differences** produce a non-blocking warning to change them by hand. Logseq's import never updates them (verified).
- **Dependency pull-in** includes parent chains with properties off by default. A dependency becomes a normal class if its library is ticked and it's selected.
- **Presets are scoped to a library** by directory.
