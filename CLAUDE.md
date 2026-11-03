# CLAUDE.md - Project Context for Claude Code

## Project Overview

**logseq-ontology-sync-plugin** (v0.2.0) is a **role builder** plugin for Logseq DB graphs (desktop 2.0.x only; file-based graphs are not supported). It loads the Schema.org library and presets from the latest `C0ntr0lledCha0s/logseq-template-graph` GitHub release (tag from the releases API; `library/schema-library.edn` + `library/schema-presets.edn` read from raw.githubusercontent at that tag, v2.0.0+; cached, "Update library" is explicit), lets the user tick presets (union), trim classes and properties per class, saves roles on a hidden "Ontology Roles" page, imports/exports role files (JSON, format `ontology-role` v1), and exports a trimmed `:graph-ontology` EDN to Downloads. The user imports that file with Logseq's own **Import -> EDN to DB Graph**. The plugin never creates entities through the API.

Idents: `:schema.class/*`, `:schema.property/*`, `:custom.*`.

Background: `docs/plugin/native-edn-import-research.md` (why EDN export instead of API creation), `docs/api-field-reconciliation.md` (historical), design and plan in `docs/superpowers/`.

## Technology Stack

- Bun (>= 1.0.0), TypeScript, Vite with vite-plugin-logseq
- Tests: Bun's built-in runner; lint: ESLint + Prettier
- Plugin SDK: `@logseq/libs` pinned exactly to `0.3.4` (npm `next` tag)

## Architecture

Data flow: library source -> parse -> selection -> view model/render -> export/conflicts -> download. Roles persist on the hidden page.

- `src/edn/` - EDN reader, writer and value helpers (keywords, sets, maps) used for the library files and the export.
- `src/library/` - `source.ts` resolves the latest release tag, downloads the library files from raw.githubusercontent at that tag and caches them (FileStorage `hasItem` before `getItem`) (explicit refresh only, update check separate); `parse.ts` turns the EDN into a typed `Library` (classes, properties, presets); `types.ts` holds the types.
- `src/role/` - `types.ts` (RoleDefinition, Selection); `selection.ts` computes the union of ticked presets plus user overrides; `export.ts` builds the trimmed `:graph-ontology` EDN and file name; `conflicts.ts` compares property type/cardinality with the live graph and blocks export on clashes; `role-file.ts` reads/writes the `ontology-role` v1 JSON.
- `src/logseq/` - Logseq-facing adapters: `role-store.ts` (roles on the hidden "Ontology Roles" page), `live-graph.ts` (reads live property schemas), `download.ts` (file download), `types.ts`.
- `src/ui/builder/` - `view-model.ts` (pure state -> view model, source tags), `overrides.ts` (user add/remove edits), `render.ts` (HTML string), `controller.ts` (events, wiring, export flow).
- `src/index.ts` entry, `src/plugin-controller.ts` toolbar button + "Ontology: Open role builder" command, `src/settings.ts`, `src/utils/logger.ts`.

Re-import is additive: Logseq never removes things on re-import, so removals are done by hand; the UI warns before export.

## Common Commands

```bash
bun run dev | build | test | typecheck | lint | deploy
```

Do not run `bun run deploy` (copies to a Windows folder).
