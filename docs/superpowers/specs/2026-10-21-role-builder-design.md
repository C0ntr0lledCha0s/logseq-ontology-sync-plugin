# Role Builder: Design

**Date:** 2026-10-21
**Status:** Approved 2026-10-21
**Repos affected:** `logseq-ontology-sync-plugin` (this repo) and `logseq-template-graph`

## Intent

James has spent a lot of effort hand-curating a Schema.org-based ontology for Logseq DB graphs in `logseq-template-graph`. For each class he chose which properties it gets, cardinality, icons, UI positions, descriptions and graph-view visibility. That curated library, not the exhaustive set that upstream Logseq's `create_graph_with_schema_org.cljs` script generates, is the source of truth.

The plugin changes from a "sync templates into the graph" tool into a **role builder**. A user builds a set of classes and properties for a function or role (for example "Client Work") by combining presets from the library and trimming to need. The plugin then writes an EDN file that the user imports with Logseq's own **Import → EDN to DB Graph**.

Why this shape:
- **Plugin-created classes and properties are owned by the plugin.** They live under `:plugin.property.<id>/*`, can't be merged with the user's own, and produce duplicates (see `docs/plugin/native-edn-import-research.md`). Logseq's native EDN import has none of these limits.
- **Fixed names make every graph line up.** Upstream Logseq names Schema.org entities `:schema.class/<Name>` and `:schema.property/<name>`. If the library uses the same names, Person is the same entity in every graph and on every re-import.
- **Re-importing updates rather than duplicates.** Native import matches classes and properties by name and updates them in place (`logseq-db/deps/db/src/logseq/db/sqlite/export.cljs`, `check-for-existing-entities` / `update-existing-properties`).

## Goals

1. The template graph publishes a **library**: one EDN file with every curated class and property under fixed `schema.*` names, plus a **presets file** describing role bundles at class and property level.
2. The plugin loads both from the latest template-graph GitHub release and offers to update when a newer library version exists.
3. In the plugin you can tick **any number of presets**. Their classes and properties are merged as a union. You can then add more classes, and switch classes or properties off.
4. Every class and property shows **where it came from** (one or more preset tags, "added by you", or "parent"), including items that are switched off.
5. **Export** writes a trimmed, valid `:graph-ontology` EDN file to the user's Downloads.
6. **Saved roles** live on a hidden page in the graph. You can reopen, edit and re-export a role, then re-import it into the same graph.
7. **Role files**: export and import a role as a file, for copying a role to another graph or backing it up.

## Non-goals

- Creating classes or properties directly through the plugin API.
- Pushing a role back into the template graph as a shared preset (roles stay personal).
- Creating new classes or properties in the builder. You only choose from the library.
- A personal role list shared across graphs. Not needed often enough; role files cover the rare case.
- Migrating graphs built from the old random-suffix template. Those are all test graphs and can be thrown away.
- The Cloudflare self-hosting guide. It's a separate project, brainstormed separately.

## Anti-goals (would count as failure even if it technically works)

- An exported file that creates entities with names other than the library's `schema.*` names, which means duplicates on import.
- Exporting something Logseq's import will reject without warning first. The known case is a property whose type or cardinality differs from what's already in the graph.
- Silently suggesting that switching something off will remove it from a graph it was already imported into.
- Losing the original preset tags of an item the user switched off.

## Current state (for orientation)

**logseq-template-graph** (v1.2.0):
- Source modules live under `source/<module>/{classes,properties}.edn`. The modules are action, base, common, creative-work, event, health, intangible, misc, organization, person, place and product.
- `scripts/build.clj` (Babashka) merges the modules into `build/logseq_db_Templates_<preset>.edn`. The full build has **135 classes and 335 properties**; the README's "47 and 129" is out of date.
- Names are random-suffix user names, for example `:user.class/Person-cB8UklzM` and `:user.property/email-UL_S9FXV`, written as `#:user.class{...}` namespace maps. Files carry `:logseq.db.sqlite.export/export-type :graph-ontology`.
- Presets (`source/presets/*.edn`) list whole modules, for example `{:name "CRM Template" :include ["person" "organization" "base" "common"]}`.
- `.github/workflows/release.yml` builds each preset on a `v*` tag and attaches it to the GitHub release. CI validates builds (`scripts/validate.sh`, including UUID reference checks).

**logseq-ontology-sync-plugin** (v0.1.0, Bun + TypeScript + Vite, `@logseq/libs` 0.0.17):
- Lists release assets from `C0ntr0lledCha0s/logseq-template-graph` (`src/marketplace/github-releases.ts`), parses EDN (`edn-data`, `src/parser`, `src/import/importer.ts`), shows a diff and confirm screen, then creates entities through the API (`src/api/ontology-api.ts`).
- The parser only recognises `user.property` / `user.class` names (`importer.ts` ~line 198).
- The sync engine (`src/sync`) is partly stubbed. Export and "Manage Sources" are unimplemented.

## Design

### Part 1: Template graph becomes the library

**1.1 Fixed names.** Convert all source modules from random-suffix user names to `:schema.class/<Name>` and `:schema.property/<name>`. Every reference must be rewritten too: `:build/class-properties`, `:build/class-extends`, `:build/property-classes`, and any property references inside `:build/properties`. Use Schema.org's exact spelling and case for names; the old names' casing varies (for example `Parents`). This is a one-off conversion with no compatibility layer for the old names. The build's existing UUID transformation and validation (`d9d59b5`, `0e88580`) must be updated or removed to match.

Name collisions: a class and a property that differ only in case can coexist. Upstream's full export has `:schema.class/Event` (title "Event") next to `:schema.property/event` (title "event"), with nothing renamed. So no `_Class` renaming is expected. If the build hits a real collision, fail the build rather than renaming silently.

Misnamed entries (my call): where a library entry is meant to be a Schema.org term but is spelt wrong, rename it to Schema.org's real name:
- class `LivestyleModification` → `LifestyleModification`
- property `Parents` → `parent`
- property `Event` → `event`. Schema.org has both a class `Event` and a property `event`, and the library keeps both: `:schema.class/Event` and `:schema.property/event`. Only the property's name changes.

The `Rating` property has no Schema.org property spelt that way. Treat it as a custom item (see 1.1a).

**1.1a Custom (non-Schema.org) entries.** Keep entries that aren't Schema.org terms, but under a separate `custom` namespace so they never clash with real Schema.org names. They are listed and tagged like any other entry in the plugin:
- `custom.property/areas` and `custom.property/project` (on Organization)
- `custom.property/readBy` (on CreativeWork)
- `custom.property/rating` (from the `Rating` property)

Drop the orphan test property `NewTest` (my call).

Drop `sourceSchema` and its 125 references to two pages that exist in no file; the schema.org `url` (1.3) replaces it (my call). Custom entries get no schema.org `url`.

**1.1b Curation workflow.** From now on, James edits the EDN source in `source/` directly, and changes are reviewed in git. Remove the Logseq-graph round trip:
- `scripts/export.sh`, `scripts/export.ps1` and `scripts/split.clj`
- the docs (`CLAUDE.md`, `docs/`, `QUICK_START.md`) that describe curating in a "Test Build" graph and exporting

Keep and adapt `scripts/build.clj` and the validation scripts.

**1.2 Keep the curation.** Keep everything that is curated now: class-to-property choices, cardinality, `:logseq.property/type`, icons, `:logseq.property/ui-position`, descriptions and `:logseq.property/exclude-from-graph-view`.

**1.3 URLs (my call).** Add a `url` to every class and property that lacks one, pointing to `https://schema.org/<id>`, the same as upstream. Upstream puts it in `:build/properties` as `:schema.property/url`. Match that, which means the library itself needs a `url` property.

**1.4 Finer presets (my call).** Change the preset format from module lists to explicit selections:

```clojure
{:id "crm"
 :name "CRM"
 :description "Customer relationship management"
 :classes {:schema.class/Person [:schema.property/email :schema.property/jobTitle ...]
           :schema.class/Organization [...]}}
```

Convert the six existing presets by expanding each included module to all its classes with all their properties, so nothing changes in meaning. James can trim them afterwards. Parent classes do not need listing; the plugin adds them automatically (see 2.3).

A preset may list, under a class, only properties attached directly to that class. To bring in an inherited property, list it under the parent class where it's defined. CI rejects anything else (my call).

**1.5 Release artifacts (my call).** On a `v*` tag, publish:
- `schema-library.edn`: every class and property, `:graph-ontology` export type, plus a library version (see below).
- `schema-presets.edn`: all presets, plus the same library version.

Stop publishing the per-preset `logseq_db_Templates_*.edn` files. Update `release.yml`, `build-templates.yml`, `scripts/validate.sh`, the README and QUICK_START to match. Fix the out-of-date README counts at the same time.

How the version is carried inside the library EDN is left to the builder. It must not stop Logseq's import from accepting the file, and the plugin must strip it from exports if Logseq would reject it.

**1.6 Validation.** CI must check that:
- every preset references only classes and properties that exist in the library, and only properties attached to that class (directly or by inheritance)
- every library file imports cleanly into an empty DB graph

For the import check, the new upstream CLI (`logseq graph import --type edn`) or the nbb-logseq tooling in `logseq-db/scripts` are both options. The choice is the builder's.

### Part 2: Plugin becomes the role builder

**2.1 Library loading.**
- Fetch `schema-library.edn` and `schema-presets.edn` from the latest template-graph GitHub release, and cache the last good copy. This replaces the per-template marketplace list in `src/marketplace`.
- Show the library version.
- When a newer release exists, offer to update. Don't update silently, because a library change can change what a saved role exports.

**2.2 Screen.** See the approved mockup at `docs/superpowers/specs/assets/2026-10-21-role-builder-mockup.html`. It has three areas:
- **Presets bar** across the top: multi-select chips, one per preset, plus an "add class" search box.
- **Contents column** on the left: classes as a table of contents, showing hierarchy and an on/total property count per class (for example "Person 9/24"). Clicking jumps to that class; scrolling highlights the current one. Switched-off classes stay listed, shown as switched off.
- **Scrolling page** on the right: one section per class, headed by its name, preset tags and parent. Below that, a row per property with an on/off toggle, preset tags and type. Node-type properties show their target classes (for example "→ Organization").
  - Properties not in any selected preset are listed greyed so they can be switched on.
  - Switched-off items keep their tags and show "switched off by you".
- **Buttons:** Save role, Export EDN. Also somewhere: export role file and import role file.

How this is rendered in the plugin (main UI iframe, framework or plain DOM) is the builder's choice. Follow what the plugin already uses (`src/ui`) unless there's a good reason not to.

**2.3 Selection rules.**
- **Switches are per class and property (my call):** `email` can be on for Person and off for Organization. A property is exported if it's on for at least one selected class, and trimmed from the `:build/class-properties` of each class where it's off. Inherited properties appear and switch only in the section of the class that defines them.
- **Union:** ticking presets merges their classes and, per class, the union of their properties. Each item records which presets contributed it.
- **Parents:** a selected class pulls in its parent classes (by `:build/class-extends`, up to `Thing`), tagged "parent". Whether an auto-added parent's own properties default to on or off is the builder's call, but it must be visible and switchable.
- **Your changes persist across preset changes:** ticking or unticking a preset must not undo something you switched on or off yourself. An item added by you stays when every preset that included it is unticked.
- **Node-type properties:** a property that links to other classes (`:build/property-classes`) may point at classes that aren't selected. Warn about it, and filter the property's target classes in the export down to the selected ones, or keep them by adding those classes. Which of the two is the builder's call; state which in the UI.

**2.4 Export.**
- Build a `:graph-ontology` EDN map containing only the selected classes and properties, plus everything they reference. Use the library's `schema.*` names unchanged, so re-imports match.
- Trim each class's `:build/class-properties` to the selected properties.
- Trigger a browser download named `<role-name>.edn`, which lands in Downloads by default. Show a short "Now use Import → EDN to DB Graph" hint.

**2.5 Saved roles.**
- **Storage:** a hidden page in the current graph. Create it with `Editor.createPage`, then hide it with `upsertBlockProperty(<page>, ':logseq.property/hide?', true)`. Hidden pages are left out of search and page lists but still sync. This call is **unverified** for plugins and must be proven first; if it fails, raise it rather than falling back silently.
- **Contents of a saved role:**
  - name
  - library version
  - selected presets
  - your changes (items switched on or off by you)
  - a snapshot of what was in the last export: each class and property with its type and cardinality, as last exported to this graph
- **Opening a saved role** recomputes the selection from the current library plus the saved presets and changes.
- **Role files:** export writes the same role data as a `.json` or `.edn` file (the builder's choice); import adds it to the current graph's hidden page.

**2.6 Warnings before export.**
- **Type and cardinality clashes (my call):** before exporting, read the live type and cardinality of every exported property that already exists in the current graph (`Editor.getProperty` / `getAllProperties`). Block or warn on any difference. Logseq rejects the whole import in this case ("The following imported properties conflict with the current graph"). This covers other roles, roles imported from files, newer library versions and graphs built by upstream's script.
- **Removals:** use the last-export snapshot (2.5) to warn when something previously exported is now switched off. Re-importing won't remove it from the graph; it has to be removed by hand.

**To verify first:** when re-importing an existing class, does `:build/class-properties` replace the class's property list or add to it? The removal warning's wording depends on the answer.

**2.7 Removed (my call).** Delete the following; no compatibility layer:
- creating entities through the API (`src/api/ontology-api.ts` create paths)
- the sync engine (`src/sync`)
- source registry and fetcher code that only served sync (`src/sources`)
- the "coming soon" export and Manage Sources screens
- the diff and confirm import flow

Keep anything genuinely reusable, such as the EDN parser and logger. Update `README.md`, `CLAUDE.md` and `docs/` to describe the role builder.

**2.8 Dependencies (my call).** Upgrade `@logseq/libs` to `0.3.4` (npm `next` tag) and remove the type workarounds (`EditorWithIcon` / `EditorWithProps` / `EditorWithTags` in `ontology-api.ts`) that are no longer needed. Run `bun install` first; tests currently fail only because `node_modules` is missing.

## Constraints

- Logseq DB version only, Logseq 2.0.x (current desktop 2.0.2 beta).
- Plugins run sandboxed in the app. They can't run nbb or the CLI, and can't write the graph's SQLite directly. `logseq.Editor.importEdn()` exists but does nothing, so import must be done by the user through the app menu.
- Re-import rejects the entire file on a property type or cardinality conflict.
- Toolchain: the plugin uses Bun, TypeScript, Vite, ESLint and Prettier; the template graph uses Babashka with CI on GitHub Actions. Follow each repo's conventional-commit rules.

## Left to the builder

- UI implementation details and component structure.
- Library version field placement (1.5), and the role file format (2.5).
- Default on/off for auto-added parent properties (2.3), and the node-type target-class handling (2.3), stated in the UI.
- Caching strategy for the library, and the CI import-check tooling (1.6).
- Order of work, as long as the template-graph library release exists before the plugin depends on it. A local library file is fine during development.

## Calls made during brainstorming (for review)

The rest of the design was agreed in conversation, including:
- curating by editing EDN directly (1.1b)
- the `custom` namespace (1.1a)

The items below are my calls:
- 1.1: renaming misspelt entries to Schema.org spelling, and failing the build on a real name collision.
- 1.1a: dropping `NewTest` and `sourceSchema`.
- 1.4: a preset may list only properties attached directly to a class.
- 2.3: switches per class and property.
- 2.6: checking live graph property types before export.
- 1.3: add schema.org URLs everywhere.
- 1.4: the preset format, and converting the existing presets "module = everything" first.
- 1.5: stop publishing the per-preset EDN files.
- 2.7: remove the API-create, sync, sources and diff code outright.
- 2.8: upgrade `@logseq/libs` to 0.3.4.
