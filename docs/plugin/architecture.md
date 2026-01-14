# Logseq Plugin Architecture Analysis

> **Issue:** #2 - Research Logseq Plugin API and Architecture
> **Status:** Complete

## Overview

This document analyzes the Logseq plugin system architecture, APIs, and best practices for building database-aware plugins.

## Plugin System Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Logseq Desktop Application                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Plugin Host (iframe)                   │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │  Plugin A   │  │  Plugin B   │  │  Plugin C   │       │  │
│  │  │  (sandbox)  │  │  (sandbox)  │  │  (sandbox)  │       │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │  │
│  │         │                │                │               │  │
│  │         └────────────────┼────────────────┘               │  │
│  │                          │                                │  │
│  │                    ┌─────┴─────┐                          │  │
│  │                    │ @logseq/  │                          │  │
│  │                    │   libs    │                          │  │
│  │                    └─────┬─────┘                          │  │
│  └──────────────────────────┼────────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────────────────┼────────────────────────────────┐  │
│  │              Plugin API Bridge (postMessage)              │  │
│  └──────────────────────────┼────────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────────────────┼────────────────────────────────┐  │
│  │                   Logseq Core APIs                        │  │
│  │   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │  │
│  │   │  App    │  │ Editor  │  │   DB    │  │   UI    │     │  │
│  │   └─────────┘  └─────────┘  └─────────┘  └─────────┘     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Plugin Isolation

Plugins run in isolated iframe sandboxes with:
- Separate JavaScript execution context
- Communication via `postMessage` API
- No direct DOM access to Logseq UI
- Controlled API surface via `@logseq/libs`

## API Namespaces

### logseq.App

Application-level operations:

```typescript
// Plugin registration
logseq.App.registerCommandPalette(command, callback)
logseq.App.registerUIItem(type, opts)

// Graph information
logseq.App.getCurrentGraph()
logseq.App.getUserConfigs()

// Events
logseq.App.onCurrentGraphChanged(callback)
logseq.App.onRouteChanged(callback)
```

### logseq.Editor

Content manipulation:

```typescript
// Page operations
logseq.Editor.getAllPages()
logseq.Editor.getPage(name | uuid)
logseq.Editor.createPage(name, properties?, options?)
logseq.Editor.deletePage(name)
logseq.Editor.renamePage(oldName, newName)

// Block operations
logseq.Editor.getPageBlocksTree(pageNameOrUuid)
logseq.Editor.getBlock(uuid, options?)
logseq.Editor.insertBlock(srcBlock, content, options?)
logseq.Editor.updateBlock(uuid, content, options?)
logseq.Editor.removeBlock(uuid)
logseq.Editor.moveBlock(srcUuid, targetUuid, options?)

// Properties
logseq.Editor.getBlockProperty(uuid, key)
logseq.Editor.upsertBlockProperty(uuid, key, value)
logseq.Editor.removeBlockProperty(uuid, key)
```

### logseq.DB

Database operations (DB graphs):

```typescript
// Datascript queries
logseq.DB.datascriptQuery(query, ...inputs)
logseq.DB.q(query, ...inputs)  // Alias

// Change listening
logseq.DB.onChanged(callback)

// Example query
const query = `
  [:find (pull ?b [*])
   :where
   [?b :block/properties ?props]
   [(get ?props :type) ?type]
   [(= ?type "class")]]
`
```

### logseq.UI

User interface:

```typescript
// Messages
logseq.UI.showMsg(content, status?, options?)

// Custom UI
logseq.UI.showMainUI(options?)
logseq.UI.hideMainUI()

// Theming
logseq.UI.resolveThemeCssPropsVals()
```

## Database Architecture

### File-Based vs DB Graphs

| Feature | File-Based | DB Graph |
|---------|------------|----------|
| Storage | Markdown/Org files | Datascript database |
| Schema | Flexible | Typed with validation |
| Properties | Text-based | First-class entities |
| Classes | Convention-based | Native support |
| Performance | File I/O | In-memory queries |

### DB Graph Schema

DB graphs use typed property schemas:

```clojure
;; Property definition
{:db/ident :user.property/name-uuid
 :db/valueType :db.type/string
 :db/cardinality :db.cardinality/one
 :block/schema {:type :default
                :hide? false
                :public? true}}

;; Class definition
{:db/ident :user.class/Person-uuid
 :block/schema {:properties [:user.property/name-uuid
                             :user.property/email-uuid]}}
```

### Property Types

| Type | Description | Logseq Keyword |
|------|-------------|----------------|
| Default | Plain text | `:default` |
| Number | Numeric | `:number` |
| Date | Date picker | `:date` |
| Checkbox | Boolean | `:checkbox` |
| URL | Web link | `:url` |
| Page | Page reference | `:page` |

## Plugin Lifecycle

### Initialization

```typescript
import '@logseq/libs'

async function main() {
  // 1. Register settings
  logseq.useSettingsSchema(schema)

  // 2. Register commands
  logseq.App.registerCommandPalette(...)

  // 3. Register UI elements
  logseq.App.registerUIItem('toolbar', {...})

  // 4. Set up event listeners
  logseq.DB.onChanged(handleChange)

  // 5. Provide interaction model
  logseq.provideModel({
    handleClick: () => {...}
  })
}

// Bootstrap
logseq.ready(main).catch(console.error)
```

### Event Hooks

```typescript
// Graph changes
logseq.App.onCurrentGraphChanged((graph) => {
  // Reinitialize for new graph
})

// Database changes (DB graphs)
logseq.DB.onChanged(({ blocks, txData, txMeta }) => {
  // React to content changes
})

// Route changes
logseq.App.onRouteChanged(({ path, template }) => {
  // Handle navigation
})

// Plugin unload
logseq.beforeunload(async () => {
  // Cleanup resources
})
```

## Key APIs for Ontology Plugin

### Reading Ontology Structure

```typescript
// Get all pages (potential classes)
const pages = await logseq.Editor.getAllPages()

// Filter for class pages (DB graphs have type metadata)
const classes = pages.filter(p => p['class?'])

// Get properties for a class
const classPage = await logseq.Editor.getPage('Person')
const properties = classPage?.properties || {}
```

### Creating Classes and Properties

```typescript
// Create a class page
await logseq.Editor.createPage('Person', {
  type: 'class',
  description: 'A human being'
}, { redirect: false })

// Add property to class
await logseq.Editor.upsertBlockProperty(
  classBlockUuid,
  'properties',
  [':name', ':email', ':birthDate']
)
```

### Querying with Datascript

```typescript
// Find all classes
const classQuery = `
  [:find (pull ?p [*])
   :where
   [?p :block/name ?name]
   [?p :block/type "class"]]
`

// Find properties of a class
const propsQuery = `
  [:find (pull ?prop [*])
   :in $ ?class-name
   :where
   [?c :block/name ?class-name]
   [?c :class/properties ?prop]]
`
```

## Plugin Development Patterns

### Settings Management

```typescript
const settingsSchema = [
  {
    key: 'templatePath',
    type: 'string',
    title: 'Template Path',
    description: 'Path to template files',
    default: ''
  },
  {
    key: 'autoSync',
    type: 'boolean',
    title: 'Auto Sync',
    description: 'Sync on graph open',
    default: false
  }
]

logseq.useSettingsSchema(settingsSchema)

// Access settings
const path = logseq.settings?.templatePath
```

### Error Handling

```typescript
async function safeOperation() {
  try {
    const result = await logseq.Editor.getPage('test')
    if (!result) {
      await logseq.UI.showMsg('Page not found', 'warning')
      return
    }
    // Process result
  } catch (error) {
    console.error('[Plugin] Operation failed:', error)
    await logseq.UI.showMsg('Operation failed', 'error')
  }
}
```

### Batch Operations

```typescript
// Group multiple operations for performance
async function batchImport(items: Item[]) {
  const BATCH_SIZE = 50

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(item => createItem(item))
    )

    // Allow UI to update between batches
    await new Promise(r => setTimeout(r, 10))
  }
}
```

## Technical Requirements

### Minimum Versions

- Logseq: 0.10.0+ (for DB graph support)
- @logseq/libs: 0.0.17+
- Node.js: 18+ (for development)

### Bundle Constraints

- Target: ES2020
- Max bundle size: 100KB (gzipped)
- No native dependencies
- Tree-shakeable imports

### Browser APIs Available

- `fetch` for HTTP requests
- `FileReader` for local files
- `localStorage` (plugin-scoped)
- `crypto.subtle` for checksums

## Reference Plugins

Studied for patterns:

1. **logseq-plugin-tabs** - UI integration patterns
2. **logseq-plugin-todo** - Command palette usage
3. **logseq-plugin-journals** - Page manipulation
4. **logseq-plugin-samples** - Official examples

## Conclusion

The Logseq Plugin API provides sufficient capabilities for building an ontology sync plugin:

- **Feasible**: All required APIs are available
- **Performant**: Datascript queries enable fast reads
- **Extensible**: Settings and UI customization supported
- **Maintainable**: TypeScript support via @logseq/libs

The main technical consideration is handling the differences between file-based and DB graphs, with the recommendation to initially target DB graphs for their native schema support.
