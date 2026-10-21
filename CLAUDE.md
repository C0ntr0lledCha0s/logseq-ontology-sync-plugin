# CLAUDE.md - Project Context for Claude Code

## Project Overview

**logseq-ontology-sync-plugin** is a Logseq plugin for DB graphs (desktop 2.0.x only; file-based graphs are not supported).

> **Rebuild in progress:** the plugin is being rebuilt as a **role builder**. It will compose role definitions and export EDN that the user imports with Logseq's own menu (Import > EDN to DB Graph). All earlier sync, import and API-create code has been removed. Task 9 of the rebuild plan writes the full docs; until then the current source and `docs/superpowers/**` are authoritative.

Background research: `docs/plugin/native-edn-import-research.md` (why plugins export EDN instead of creating entities via the API), `docs/api-field-reconciliation.md` (historical).

## Technology Stack

- Bun (>= 1.0.0), TypeScript, Vite with vite-plugin-logseq
- Tests: Bun's built-in runner; lint: ESLint + Prettier
- Plugin SDK: `@logseq/libs` pinned exactly to `0.3.4` (npm `next` tag)

## Project Structure

```
src/
├── index.ts              # Entry point: init guard, DataCloneError suppression, settings, controller
├── plugin-controller.ts  # Toolbar button, "Ontology: Open role builder" command, openBuilder()
├── settings.ts           # Settings schema (currently empty)
├── parser/               # EDN parsing (to be replaced)
└── utils/logger.ts       # Structured logging
tests/                    # logger.test.ts, parser.test.ts
```

## Common Commands

```bash
bun run dev | build | typecheck | lint | test
```

Do not run `bun run deploy` (copies to a Windows folder).
