# CLAUDE.md - Project Context for Claude Code

This file provides context for Claude Code when working on this project.

## Project Overview

**logseq-ontology-sync-plugin** is a Logseq plugin for managing and synchronizing ontology templates. It allows users to import, export, and sync class/property definitions from a marketplace of templates hosted on GitHub releases.

> **DB Graphs Only**: This plugin is designed exclusively for Logseq's **database (DB) graph** mode, not the traditional file-based markdown graphs. DB graphs use a structured database with typed properties and classes - features that don't exist in file-based graphs.

### Key Features
- Import ontology templates from files or URLs
- Marketplace integration with GitHub releases
- Sync templates from configured sources
- Export current graph ontology
- Logseq-native UI panel

### Logseq DB Graph Documentation

When researching Logseq APIs or behavior, prioritize these resources:
- **DB Graph Docs**: https://docs.logseq.com/#/page/db%20graphs
- **Plugin API (DB)**: https://plugins-doc.logseq.com/ (note: some APIs are DB-specific)
- **Schema Reference**: https://docs.logseq.com/#/page/properties (for property types, cardinality)
- **Classes**: https://docs.logseq.com/#/page/classes

Avoid referencing file-based graph documentation for ontology/schema features.

## Technology Stack

- **Runtime**: Bun (>= 1.0.0)
- **Language**: TypeScript 5.3+
- **Build**: Vite with vite-plugin-logseq
- **Testing**: Bun's built-in test runner
- **Linting**: ESLint + Prettier
- **Plugin SDK**: @logseq/libs

## Project Structure

```
src/
├── index.ts              # Plugin entry point, registers commands and UI
├── plugin-controller.ts  # Main orchestrator for all plugin operations
├── settings.ts           # Plugin settings schema (useSettingsSchema)
├── api/                  # Logseq database API interactions
│   ├── ontology-api.ts   # CRUD for properties and classes
│   ├── queries.ts        # Datalog query builders
│   └── logseq-types.ts   # Type definitions for Logseq entities
├── import/               # Import workflow and diff logic
│   ├── importer.ts       # Coordinates parsing, validation, applying
│   └── diff.ts           # Compares templates, detects conflicts
├── sync/                 # Sync engine for source synchronization
│   ├── engine.ts         # Main sync orchestration
│   └── state.ts          # Sync state management
├── sources/              # Source management (URL/file fetching)
│   ├── registry.ts       # In-memory source storage
│   └── fetcher.ts        # HTTP fetch and local file reading
├── marketplace/          # GitHub releases marketplace
│   └── github-releases.ts # Fetches templates from GitHub releases
├── parser/               # EDN parsing and validation
│   └── edn-parser.ts     # Parse EDN to typed structures
├── types/                # Unified type system (canonical types)
│   ├── index.ts          # PropertyDefinition, ClassDefinition
│   └── converters.ts     # Type converters between modules
├── ui/                   # UI components
│   ├── main-panel.ts     # HTML/CSS for main plugin panel
│   └── components.ts     # showMessage, showConfirm, pickFile
└── utils/
    ├── logger.ts         # Structured logging
    └── environment.ts    # Runtime detection (browser/Node/Bun)

tests/                    # Test files (*.test.ts)
```

## Common Commands

```bash
# Development
bun run dev              # Start Vite dev server
bun run build            # Build for production (dist/)
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
```

## Key Patterns

### Plugin Controller
`PluginController` is the main orchestrator. All user-facing operations go through it:
- `showPanel()` / `closePanel()` - Toggle the main UI panel
- `importFromFile()` - Import from local .edn file
- `importTemplate(url, name)` - Import from marketplace URL
- `exportTemplate()` - Export current ontology
- `handleSync()` - Sync from configured sources

### Logseq API Usage
```typescript
// Show messages
await logseq.UI.showMsg('message', 'success' | 'error' | 'warning' | 'info')

// Settings
logseq.useSettingsSchema(settingsSchema)
logseq.showSettingsUI()
logseq.settings // Read current settings

// Main UI
logseq.showMainUI()
logseq.hideMainUI()
logseq.setMainUIInlineStyle({...})

// Inject UI
logseq.provideUI({ key, template })
logseq.provideStyle(css)
logseq.provideModel({ methodName: handler })

// Commands
logseq.App.registerCommandPalette({ key, label }, callback)
logseq.App.registerUIItem('toolbar', { key, template })
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
- `PropertyDefinition` - Property schema (name, type, cardinality)
- `ClassDefinition` - Class schema (name, parent, properties)
- `ImportPreview` - Diff result before import
- `Conflict` - Detected conflicts during import

Property types: `'default' | 'number' | 'date' | 'datetime' | 'checkbox' | 'url' | 'page' | 'node'`

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

## Testing

Tests use Bun's test runner with mocked Logseq API:
```typescript
import { describe, test, expect, beforeEach, mock } from 'bun:test'

// Mock setup in tests typically includes:
globalThis.logseq = { /* mock methods */ }
```

Key test files:
- `tests/api.test.ts` - Ontology API operations
- `tests/import.test.ts` - Import and diff logic
- `tests/sync.test.ts` - Sync engine operations
- `tests/parser.test.ts` - EDN parsing

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

## Related Issues

- Issue #24: Import from URL or file (implemented)
