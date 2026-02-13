# CLAUDE.md - Project Context for Claude Code

This file provides context for Claude Code when working on this project.

## Project Overview

**logseq-ontology-sync-plugin** is a Logseq plugin for managing and synchronizing ontology templates. It allows users to import, export, and sync class/property definitions from a marketplace of templates hosted on GitHub releases.

> **DB Graphs Only**: This plugin is designed exclusively for Logseq's **database (DB) graph** mode, not the traditional file-based markdown graphs. DB graphs use a structured database with typed properties and classes - features that don't exist in file-based graphs.

### Key Features
- Import ontology templates from files or URLs
- Marketplace integration with GitHub releases
- Sync templates from configured sources
- Export current graph ontology (partially implemented - detection only, full export TODO)
- Logseq-native UI panel with dark/light mode support
- Logseq-native confirmation and progress dialogs
- Tabler icon support for properties and classes

### Logseq DB Graph Documentation

When researching Logseq APIs or behavior, prioritize these resources:
- **Plugin API Reference**: https://logseq.github.io/plugins/interfaces/IEditorProxy.html (TypeDoc reference)
- **Plugin API Overview**: https://plugins-doc.logseq.com/ (note: some APIs are DB-specific)
- **DB Graph Docs**: https://docs.logseq.com/#/page/db%20graphs
- **Schema Reference**: https://docs.logseq.com/#/page/properties (for property types, cardinality)
- **Classes**: https://docs.logseq.com/#/page/classes

Avoid referencing file-based graph documentation for ontology/schema features.

### DB Mode API Reference (from IEditorProxy)

**Property Management:**
```typescript
// Create or update a property with schema
upsertProperty(key: string, schema?: {
  cardinality?: "many" | "one";
  hide?: boolean;
  public?: boolean;
  type?: "default" | "number" | "node" | "date" | "checkbox" | "url";
}, opts?: { name?: string }): Promise<IEntityID>

getProperty(key: string): Promise<PropertyEntity>
removeProperty(key: string): Promise<void>
getAllProperties(): Promise<PropertyEntity[]>
```

**Tag/Class Management:**
In Logseq DB mode, **Tags = Classes**. Use these dedicated methods:
```typescript
// Create a new tag (class)
createTag(tagName: string, opts?: { uuid?: string }): Promise<PageEntity>

// Link a property to a tag
addTagProperty(tagId: BlockIdentity, propertyIdOrName: BlockIdentity): Promise<void>
removeTagProperty(tagId: BlockIdentity, propertyIdOrName: BlockIdentity): Promise<void>

// Set tag inheritance (parent class)
addTagExtends(tagId: BlockIdentity, parentTagIdOrName: BlockIdentity): Promise<void>
removeTagExtends(tagId: BlockIdentity, parentTagIdOrName: BlockIdentity): Promise<void>

// Query tags
getAllTags(): Promise<PageEntity[]>
getTag(nameOrIdent: string | number): Promise<PageEntity>
getTagsByName(tagName: string): Promise<PageEntity[]>
```

**Block Tag Operations:**
```typescript
addBlockTag(blockId: BlockIdentity, tagId: BlockIdentity): Promise<void>
removeBlockTag(blockId: BlockIdentity, tagId: BlockIdentity): Promise<void>
```

**Icon Management:**
```typescript
// Set icon on a block/page/property/tag
setBlockIcon(blockId: string, iconType: 'tabler-icon' | 'emoji', iconName: string): Promise<void>
removeBlockIcon(blockId: string): Promise<void>
```
> **Implementation Status (Feb 2025):**
> - ✅ **Tabler icons are IMPLEMENTED** - The plugin now sets Tabler icons on properties and tags during import/update
> - ❌ **Emoji icons are NOT supported** - Logseq's emoji lookup table is inaccessible; all emoji formats fail with "Can't find emoji for X"
>
> When importing ontology with emoji icons, they are parsed but skipped during application. Only Tabler icons are applied.
> Icon types are `"tabler-icon"` (icon name from Tabler Icons library) or `"emoji"` (not supported via API).

**Setting System Description Field:**
```typescript
// ❌ WRONG - creates a user property named "description"
await logseq.Editor.upsertBlockProperty(uuid, 'description', 'My description')

// ✅ CORRECT - sets the system logseq.property/description field
await logseq.Editor.upsertBlockProperty(uuid, ':logseq.property/description', 'My description')
```
> **Discovery (Feb 2025):** Using the full namespaced key with colon prefix sets the SYSTEM description field, not a user property. The value is stored as an entity reference internally.

> **Note:** There is no `upsertTag` method - use `createTag` for creation. The plugin ownership restriction still applies: plugins can only modify entities they created.

## Technology Stack

- **Runtime**: Bun (>= 1.0.0)
- **Language**: TypeScript 5.3+ (strict mode, `noUncheckedIndexedAccess` enabled)
- **Build**: Vite 5 with vite-plugin-logseq
- **Testing**: Bun's built-in test runner (with coverage)
- **Linting**: ESLint 8 + Prettier 3
- **Plugin SDK**: @logseq/libs ^0.0.17
- **EDN Parsing**: edn-data ^1.1.2
- **CI/CD**: GitHub Actions

## Project Structure

```
src/
├── index.ts              # Plugin entry point, registers commands and UI
├── plugin-controller.ts  # Main orchestrator for all plugin operations
├── settings.ts           # Plugin settings schema (useSettingsSchema)
├── api/                  # Logseq database API interactions
│   ├── index.ts          # Barrel exports for API module
│   ├── ontology-api.ts   # CRUD for properties and classes (~1800 lines)
│   ├── logseq-api.ts     # Logseq API wrapper utilities
│   ├── logseq-types.ts   # Type definitions for Logseq entities
│   ├── queries.ts        # Datalog query builders
│   └── types.ts          # API-specific type definitions
├── import/               # Import workflow and diff logic
│   ├── index.ts          # Barrel exports for import module
│   ├── importer.ts       # Coordinates parsing, validation, applying
│   ├── diff.ts           # Compares templates, detects conflicts
│   └── types.ts          # Import-specific type definitions
├── sync/                 # Sync engine for source synchronization
│   ├── index.ts          # Barrel exports for sync module
│   ├── engine.ts         # Main sync orchestration
│   ├── state.ts          # Sync state management
│   └── types.ts          # Sync-specific type definitions
├── sources/              # Source management (URL/file fetching)
│   ├── index.ts          # Barrel exports for sources module
│   ├── registry.ts       # In-memory source storage
│   ├── fetcher.ts        # HTTP fetch and local file reading
│   └── types.ts          # Source-specific type definitions
├── marketplace/          # GitHub releases marketplace
│   ├── index.ts          # Barrel exports for marketplace module
│   ├── github-releases.ts # Fetches templates from GitHub releases
│   └── types.ts          # Marketplace-specific type definitions
├── parser/               # EDN parsing and validation
│   ├── index.ts          # Barrel exports for parser module
│   ├── edn-parser.ts     # Parse EDN to typed structures (uses edn-data library)
│   ├── validator.ts      # EDN template validation logic
│   └── types.ts          # Parser-specific type definitions
├── types/                # Unified type system (canonical types)
│   ├── index.ts          # PropertyDefinition, ClassDefinition (~750 lines)
│   └── converters.ts     # Type converters between modules
├── ui/                   # UI components
│   ├── main-panel.ts     # HTML/CSS for main plugin panel
│   └── components.ts     # showMessage, showConfirm, pickFile, progress dialogs
└── utils/
    ├── index.ts          # Barrel exports for utils module
    ├── logger.ts         # Structured logging with level control
    └── environment.ts    # Runtime detection (browser/Node/Bun)

tests/                    # Test files (*.test.ts)
├── api.test.ts           # Ontology API operations
├── import.test.ts        # Import and diff logic
├── sync.test.ts          # Sync engine operations
├── parser.test.ts        # EDN parsing
└── logger.test.ts        # Logger utility

docs/                     # Project documentation
├── api-field-reconciliation.md        # API field mapping documentation
├── plugin/
│   ├── architecture.md                # Plugin system architecture
│   ├── api-spec.md                    # API specifications
│   ├── technical-spec.md              # Technical specifications
│   ├── native-edn-import-research.md  # Native EDN import research
│   └── edn-parser-analysis.md         # EDN parser analysis
└── examples/
    └── crm-test-minimal.edn           # Minimal test EDN file for native import

.claude/                  # Claude Code configuration
├── github-workflows/     # Active issues tracking
└── skills/
    └── logseq-db-plugin-api/          # Production-tested DB plugin API patterns
        ├── SKILL.md                   # Skill definition
        └── references/               # Core APIs, pitfalls, event handling, etc.

.github/
└── workflows/
    └── ci.yml            # GitHub Actions CI (typecheck, lint, format, test, build)
```

## Common Commands

```bash
# Development
bun run dev              # Start Vite dev server
bun run build            # Full build: typecheck + Vite + package setup
bun run build:package    # Create dist/package.json (strips dev deps)
bun run deploy           # Build and copy to local Logseq plugins folder

# Testing
bun run test             # Run all tests
bun run test:watch       # Watch mode
bun run test:coverage    # With coverage report

# Code Quality
bun run lint             # ESLint check
bun run lint:fix         # ESLint auto-fix
bun run typecheck        # TypeScript type check
bun run format           # Prettier format
bun run format:check     # Prettier check (CI uses this)
```

## Architecture

### Three-Layer Design

```
UI Layer          (PluginController, main-panel, components)
     ↓
Business Layer    (OntologyImporter, SyncEngine, SourceRegistry, Marketplace)
     ↓
API Layer         (LogseqOntologyAPI, SourceFetcher, EDN Parser)
     ↓
Logseq SDK        (@logseq/libs)
```

### Plugin Bootstrap Flow

1. `logseq.ready(main)` in `src/index.ts`
2. Double-initialization guard (prevents re-registration on script reload)
3. DataCloneError handler installed (suppresses cosmetic IPC errors)
4. Settings schema registered
5. `PluginController` instantiated → creates API, Importer, SyncEngine, SourceRegistry
6. UI initialized (styles injected, container created)
7. Dialog handlers registered (confirm, progress)
8. Model provided for `data-on-click` handlers
9. Toolbar icon and command palette entries registered
10. Cleanup handler registered via `logseq.beforeunload`

### Import Workflow

The import process follows a preview-then-apply pattern:

1. **Parse** - EDN content → typed structures (via edn-data library)
2. **Validate** - Type/structure validation with detailed error messages
3. **Preview** - Diff against existing ontology, detect conflicts
4. **Confirm** - Show Logseq-native confirmation dialog with change summary
5. **Apply** - Execute changes with progress tracking dialog
6. **Refresh** - Navigate to All Pages to show newly created items

## Key Patterns

### Plugin Controller
`PluginController` is the main orchestrator. All user-facing operations go through it:
- `showPanel()` / `closePanel()` - Toggle the main UI panel
- `importFromFile()` - Import from local .edn file
- `importTemplate(url, name)` - Import from marketplace URL
- `exportTemplate()` - Export current ontology (stub: shows count only)
- `handleSync()` - Sync from configured sources
- `refreshMarketplace()` - Reload marketplace templates
- `openSettings()` - Open Logseq settings UI

### Logseq API Usage
```typescript
// Show messages
await logseq.UI.showMsg('message', 'success' | 'error' | 'warning' | 'info')

// Settings
logseq.useSettingsSchema(settingsSchema)
logseq.showSettingsUI()
logseq.settings // Read current settings

// Main UI
logseq.showMainUI({ autoFocus: true })
logseq.hideMainUI()
logseq.setMainUIInlineStyle({...})

// Inject UI
logseq.provideUI({ key, template })
logseq.provideStyle(css)
logseq.provideModel({ methodName: handler })

// Commands
logseq.App.registerCommandPalette({ key, label }, callback)
logseq.App.registerUIItem('toolbar', { key, template })

// Navigation
logseq.App.pushState('all-pages') // Navigate to All Pages
```

### UI Event Handling
UI uses `data-action` attributes with direct DOM event listeners (more reliable than `data-on-click` in DB mode):
```html
<button data-action="import-file">Import</button>
```
```typescript
container.querySelector('[data-action="import-file"]')?.addEventListener('click', () => {
  void controller.importFromFile()
})
```

### Type System
Canonical types in `src/types/index.ts`:
- `PropertyDefinition` - Property schema (name, type, cardinality, icon, description)
- `ClassDefinition` - Class schema (name, parent, properties, icon, description)
- `ClosedValue` - Enum-like property values (value, icon, description)
- `ImportPreview` / `ImportResult` / `ImportProgress` - Import workflow types
- `Conflict` - Detected conflicts during import
- `Source` / `FetchResult` / `SyncState` / `SyncResult` - Source/sync types
- `ValidationResult` / `ValidationIssue` - Validation types
- Error classes: `APIError`, `SyncError`, `SourceNotFoundError`, `FetchError`, `ValidationError`

Each module also has its own `types.ts` for module-specific type definitions.

Property types: `'default' | 'number' | 'date' | 'datetime' | 'checkbox' | 'url' | 'page' | 'node'`

### Name Normalization & Casing
Logseq normalizes names to lowercase-kebab-case. The plugin also applies display-friendly casing:
- **Properties** → `camelCase` (e.g., "reservation-status" displays as "reservationStatus")
- **Classes/Tags** → `PascalCase` (e.g., "reservation-status" displays as "ReservationStatus")

Comparison logic is always case-insensitive.

### Error Handling Pattern
```typescript
try {
  // operation
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error'
  logger.error('Operation failed', error)
  await showMessage(`Operation failed: ${message}`, 'error')
}
```

### DataCloneError Handling
Logseq's plugin IPC uses `postMessage`, which can fail to serialize objects containing functions. These errors are cosmetic (the operation succeeded). The plugin handles this at two levels:

1. **Global handler** in `index.ts` suppresses unhandled `DataCloneError` rejections
2. **API-level** `safeApiCall` wrapper catches and returns `undefined` for DataCloneErrors

### Batch Operations (Non-Atomic)
The `LogseqOntologyAPI` provides batch operations that are **not truly atomic**:
- If operation 3 of 5 fails, operations 1-2 are already persisted
- `appliedItems` in `BatchResult` enables manual cleanup
- Always validate data before starting a batch
- Use dry-run / preview mode to check changes first

### Progress Tracking
Long operations use a callback pattern:
```typescript
onProgress?.({
  current: i + 1,
  total: items.length,
  percentage: Math.round(((i + 1) / items.length) * 100),
})
```
The `showProgressDialog` component renders this in a Logseq-native dialog.

## Plugin Settings

Defined in `src/settings.ts` via `logseq.useSettingsSchema()`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `marketplaceRepo` | `string` | `C0ntr0lledCha0s/logseq-template-graph` | GitHub owner/repo for templates |
| `autoSync` | `boolean` | `false` | Enable automatic sync checks |
| `syncInterval` | `enum` | `daily` | Sync frequency: `hourly`, `daily`, `weekly` |

## Testing

Tests use Bun's test runner with mocked Logseq API:
```typescript
import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock setup in tests typically includes:
globalThis.logseq = { /* mock methods */ }
```

Test files:
- `tests/api.test.ts` - Ontology API operations (create, update, batch, ownership errors)
- `tests/import.test.ts` - Import and diff logic (parsing, validation, conflict detection)
- `tests/sync.test.ts` - Sync engine operations (state management, checksums, retries)
- `tests/parser.test.ts` - EDN parsing (format detection, type extraction)
- `tests/logger.test.ts` - Logger utility (level filtering, output formatting)

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on:
- Push to `main`, `develop`, and `claude/**` branches
- Pull requests to `main` and `develop`

Pipeline stages:
1. **Test and Lint** job: typecheck → lint → format:check → tests → build
2. **Build Plugin** job (depends on test): builds and uploads `dist/` as artifact (7-day retention)

## Code Style

Enforced by ESLint + Prettier:
- **Line width**: 100 characters
- **Semicolons**: None
- **Quotes**: Single quotes
- **Indentation**: 2 spaces
- **Trailing commas**: ES5
- **Arrow parens**: Always
- **Console**: `warn`/`error` allowed; `log`/`info`/`debug` disallowed (use `logger`)
- **Unused vars**: Error, unless prefixed with `_`
- **`any`**: Warning (not error)

TypeScript strict mode with additional safety:
- `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- `noImplicitReturns`, `noUncheckedIndexedAccess`
- Path alias: `@/*` → `src/*`

## Default Marketplace

Templates are fetched from the latest release of:
`https://github.com/C0ntr0lledCha0s/logseq-template-graph/releases`

Available template categories:
- `content` - Content management templates
- `crm` - CRM/contact templates
- `events` - Event management templates
- `research` - Research/notes templates
- `full` - Complete template set

## Important Notes

### DB Graph Specifics

1. **Plugin Ownership Restrictions**: In DB mode, Logseq enforces plugin ownership - a plugin can only modify properties/classes it created. Attempting to modify entities created by other plugins or manually by the user will fail with "Plugins can only upsert its own properties". The importer handles this gracefully by skipping such entities.

2. **Name Normalization**: Logseq normalizes all property and class names to lowercase with hyphens replacing spaces (e.g., "First Name" → "first-name"). The diff and import logic accounts for this with case-insensitive matching.

3. **Native Export Format**: Logseq DB graphs export ontology using tagged EDN with namespace reader macros (e.g., `#:user.property{...}`). The importer auto-detects and parses both this native format and simplified template format.

### General Plugin Notes

4. **Browser Environment**: Plugin runs in Logseq's sandboxed iframe. Some browser APIs like `window.prompt()` may not work - use Logseq's native UI methods instead.

5. **No Persistent Storage**: `SourceRegistry` is currently in-memory only. Consider using `logseq.settings` for persistence.

6. **Transactions**: Logseq's transaction API is not truly atomic. The code uses batch operations with manual error handling.

7. **fs/promises Warning**: The `SourceFetcher` dynamically imports `fs/promises` for Node/Bun environments. This shows a Vite warning during build but is intentional.

### Native EDN Import Research (Feb 2025)

8. **Native Import vs Plugin API**: Logseq's native "Import > EDN to DB Graph" creates entities in the `user.*` namespace, while plugin API creates entities in `plugin.property.{plugin-name}/*` namespace. Plugins can READ all entities but can only MODIFY entities in their own namespace.

9. **Undocumented `importEdn` API**: `logseq.Editor.importEdn()` exists at runtime but is a non-functional stub. It returns `null` but creates no entities. The native import uses internal ClojureScript handlers not exposed to plugins.

10. **Hybrid Workflow Option**: For user-owned entities, a hybrid approach is viable: plugin prepares EDN file, user imports via native menu. See `docs/plugin/native-edn-import-research.md` for full details.

### Incomplete Features

11. **Export**: `exportTemplate()` currently only detects existing classes/properties and shows a count. Full EDN export with file download is TODO.

12. **Source Management UI**: `handleManageSources()` shows a stub message. Full source CRUD UI is TODO.

## Documentation

- `docs/plugin/architecture.md` - Plugin system architecture
- `docs/plugin/api-spec.md` - API specifications
- `docs/plugin/technical-spec.md` - Technical specifications
- `docs/plugin/native-edn-import-research.md` - Native EDN import research
- `docs/plugin/edn-parser-analysis.md` - EDN parser analysis
- `docs/api-field-reconciliation.md` - API field mapping and reconciliation
- `docs/examples/crm-test-minimal.edn` - Minimal test EDN file for native import

### Claude Code Skills

The `.claude/skills/logseq-db-plugin-api/` directory contains production-tested patterns for Logseq DB plugin development, including reference docs for core APIs, event handling, tag detection, queries, property management, pitfalls, and plugin architecture patterns.

## Related Issues

- Issue #24: Import from URL or file (implemented)
