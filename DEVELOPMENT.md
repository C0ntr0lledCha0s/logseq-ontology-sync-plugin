# Developer notes

Notes for working on the Ontology Role Builder plugin. The user-facing guide is [README.md](README.md). Contribution rules are in [CONTRIBUTING.md](CONTRIBUTING.md).

## How it works

The plugin is a **role builder** for Logseq DB graphs (desktop 2.0.x only; file-based graphs are not supported).

- **Library source.** On first use it resolves the latest release tag of [`C0ntr0lledCha0s/logseq-template-graph`](https://github.com/C0ntr0lledCha0s/logseq-template-graph) (v2.0.0 or later) from the GitHub releases API. It then downloads `library/schema-library.edn` and `library/schema-presets.edn` from raw.githubusercontent.com at that tag and caches them in plugin file storage. It never refetches on its own; **Update library** is the only refresh.
- **Selection.** A role is the union of the ticked presets plus the user's own add/remove overrides.
- **Storage.** Roles are saved on a hidden page named "Ontology Roles". Role files are JSON, format `ontology-role`, version 1.
- **Export.** The plugin writes a trimmed `:graph-ontology` EDN file to Downloads. The user imports it with Logseq's **Import -> EDN to DB Graph**. The plugin never creates classes or properties through the plugin API. See [docs/plugin/native-edn-import-research.md](docs/plugin/native-edn-import-research.md) for why.
- **Conflict check.** Before export, property type and cardinality are compared with the live graph; clashes block export.
- **Re-import is additive.** Logseq never removes anything on re-import, so the UI warns before an export that drops previously exported items.

Idents: `:schema.class/*` and `:schema.property/*` for library items, `:custom.*` for user additions.

Data flow: library source -> parse -> selection -> view model/render -> export/conflicts -> download.

## Tooling

- [Bun](https://bun.sh) - runtime, package manager and test runner
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) with vite-plugin-logseq
- [ESLint](https://eslint.org/) and [Prettier](https://prettier.io/)
- `@logseq/libs` pinned exactly to `0.3.4`

### Prerequisites

- Bun >= 1.0.0
- Logseq desktop 2.0.x with a DB graph

### Setup

```bash
git clone https://github.com/C0ntr0lledCha0s/logseq-ontology-sync-plugin.git
cd logseq-ontology-sync-plugin
bun install
```

### Commands

```bash
bun run dev            # Vite dev server with hot reload
bun test               # Run tests
bun test --watch       # Tests in watch mode
bun run test:coverage  # Tests with coverage
bun run typecheck      # TypeScript check
bun run lint           # ESLint
bun run lint:fix       # ESLint with fixes
bun run format         # Prettier write
bun run format:check   # Prettier check
bun run build          # Typecheck, Vite build, then package into dist/
```

Do not run `bun run deploy`; it copies the build to a local Windows folder.

## Project structure

```
logseq-ontology-sync-plugin/
├── .github/workflows/   # CI
├── src/
│   ├── index.ts         # Plugin entry point
│   ├── plugin-controller.ts # Toolbar button, command
│   ├── settings.ts      # Settings schema (empty for now)
│   ├── edn/             # EDN reader/writer
│   ├── library/         # Release fetch + cache, library/preset parsing
│   ├── role/            # Selection, export, conflicts, role files
│   ├── logseq/          # Role store, live-graph reads, download
│   ├── ui/builder/      # View model, rendering, controller
│   └── utils/           # Logger
├── scripts/package.ts   # Copies plugin files into dist/
├── tests/               # Bun tests
├── docs/                # Research, designs and plans
├── dist/                # Build output (generated)
├── index.html           # Plugin HTML entry
└── vite.config.ts, tsconfig.json, bunfig.toml, .eslintrc.json, .prettierrc.json
```

## Packaging and the README

`bun run build` ends with `scripts/package.ts`, which writes `dist/` with a stripped `package.json`, `icon.svg`, `CHANGELOG.md`, `LICENSE`, and `README.md` saved as `readme.md`. Logseq shows that `readme.md` to people who install the plugin, so keep README.md written for users.

Any file that README.md links to with a relative path is copied into `dist/` too, and the build fails if it is missing. Link developer material from the README with a full GitHub URL so it is not shipped.

## Testing in Logseq

1. Build the plugin: `bun run build`
2. In Logseq: **Settings -> Plugins**, turn on Developer mode, click **Load unpacked plugin**, and pick the `dist/` folder.
3. For hot reload, run `bun run dev` and reload the plugin in Logseq after changes.

## Running tests

Tests use Bun's built-in runner:

```bash
bun test                           # All tests
bun test tests/selection.test.ts   # One file
bun run test:coverage              # With coverage
```

## CI

GitHub Actions runs on pushes and pull requests: typecheck, ESLint, Prettier check, unit tests, and a build.

## Releases

Each release attaches `logseq-ontology-sync-plugin-vX.Y.Z.zip`, the packaged `dist/` folder. Record changes in [CHANGELOG.md](CHANGELOG.md).

## Background docs

- [docs/plugin/native-edn-import-research.md](docs/plugin/native-edn-import-research.md) - why the plugin exports EDN instead of creating entities through the API
- [docs/api-field-reconciliation.md](docs/api-field-reconciliation.md) - historical
- `docs/superpowers/` - designs and plans
