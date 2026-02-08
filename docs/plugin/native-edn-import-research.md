# Native EDN Import Research

> **Research Date:** February 2025
> **Status:** Complete
> **Related:** Plugin Architecture, API Spec

## Executive Summary

This document details research into using Logseq's native EDN import functionality from within a plugin. The research reveals that while native import works perfectly, it's not directly accessible to plugins due to namespace-based ownership restrictions.

**Key Finding**: A hybrid workflow is viable where the plugin prepares EDN files and the user imports via Logseq's native menu.

| Finding | Status |
|---------|--------|
| Native import works | Fully functional via menu |
| Creates proper entities | Properties, classes, icons, inheritance |
| Plugin can READ imported entities | Full visibility |
| Plugin can MODIFY imported entities | Namespace restriction |
| Hybrid workflow possible | Plugin prepares, user imports |

---

## Research Findings

### 1. Native EDN Import Works Perfectly

Tested with minimal CRM template via Menu > Import > EDN to DB Graph:

| Feature | Result |
|---------|--------|
| Properties created | email, telephone, jobTitle |
| Classes created | Person, Organization |
| Icons applied | Tabler icons on all entities |
| Descriptions set | Via `:logseq.property/description` |
| Class properties linked | `class/properties: [4234, 4236]` |
| Class inheritance | `class/extends: [1]` |
| Cardinality set | `:db.cardinality/one` |

### 2. Namespace-Based Entity Ownership

**Critical Discovery**: Logseq uses namespaces to enforce ownership:

| Source | Namespace Pattern | Example |
|--------|-------------------|---------|
| Native import | `user.property/*`, `user.class/*` | `:user.property/email-TEST01` |
| Plugin API | `plugin.property.{plugin-name}/*` | `:plugin.property.logseq-ontology-sync/email` |
| System | `logseq.property/*` | `:logseq.property/icon` |

**Implications**:
- Plugin CAN create new entities (in its namespace)
- Plugin CAN read ALL entities (any namespace)
- Plugin CANNOT modify entities in other namespaces
- Calling `upsertProperty('email')` creates a NEW property, not updating existing

### 3. Plugin API Visibility

After native import, plugins can see all entities:

```javascript
// Plugin CAN see natively-imported entities:
logseq.Editor.getAllProperties()
// Returns: [..., {ident: ':user.property/email-TEST01', ...}]

logseq.Editor.getAllTags()
// Returns: [..., {ident: ':user.class/Person-TEST01', ...}]

// Full entity structure accessible:
{
  ident: ':user.property/jobTitle-TEST03',
  name: 'jobtitle',
  title: 'jobTitle',
  ':logseq.property/type': 'default',
  ':logseq.property/icon': { type: 'tablerIcon', id: 'Briefcase' },
  cardinality: ':db.cardinality/one',
  createdAt: 1770538173682,
  updatedAt: 1770538173682
}
```

### 4. Plugin Modification Attempts

```javascript
// Trying to update natively-imported property:
logseq.Editor.upsertProperty('email', { type: 'url' })

// Result: Creates NEW property in plugin namespace!
// ident: ':plugin.property.logseq-ontology-sync/email'
// Does NOT modify :user.property/email-TEST01
```

### 5. Undocumented `importEdn` API

We discovered `logseq.Editor.importEdn()` exists at runtime but is non-functional:

```javascript
typeof logseq.Editor.importEdn  // 'function' - exists!

// But calling it does nothing:
logseq.Editor.importEdn(JSON.stringify({properties: {...}, classes: {...}}))
// Returns: null
// Creates: NOTHING

// Other import methods don't exist at all:
logseq.Editor.importOntology(...)  // "Not existed method"
logseq.Editor.importData(...)      // "Not existed method"
```

---

## Native Import Architecture

### Core Implementation Files

| File | Purpose |
|------|---------|
| `src/main/frontend/handler/db_based/import.cljs` | Import workflow coordinator |
| `deps/db/src/logseq/db/sqlite/export.cljs` | Graph serialization |
| `deps/db/src/logseq/db/sqlite/build.cljs` | Graph reconstruction |
| `deps/graph-parser/src/logseq/graph_parser.cljs` | Core parsing library |

### Key Import Functions (ClojureScript)

```clojure
;; Primary EDN import function
(defn import-from-edn-file! [content]
  ;; 1. Validates EDN syntax using edn/read-string
  ;; 2. Handles parsing errors with user messages
  ;; 3. Uses batch-import-edn! for processing
  ;; 4. Executes with metadata {:import-db? true})

;; Also available:
(defn import-from-sqlite-db! [...])    ;; SQLite DB import
(defn import-from-debug-transit! [...]) ;; Transit format
```

### Transaction Model

- Import marked with `:import-db? true` metadata
- Not truly atomic - batch operations with manual error handling
- Graph rebuilds after batch import
- UI refresh after transaction completion

---

## EDN Format Specification

### Native Logseq Format

```clojure
{:properties
 #:user.property{:property-name-SUFFIX
                 {:db/cardinality :db.cardinality/one,
                  :logseq.property/type :default,
                  :block/title "property-name",
                  :build/properties
                  #:logseq.property{:description "...",
                                    :icon {:type :tabler-icon, :id "IconName"}}}}
 :classes
 #:user.class{:ClassName-SUFFIX
              {:block/title "ClassName",
               :build/class-properties [:user.property/prop1-SUFFIX ...],
               :build/class-extends [:user.class/ParentClass-SUFFIX],
               :build/properties
               #:logseq.property{:description "...",
                                 :icon {:type :tabler-icon, :id "IconName"}}}}
 :logseq.db.sqlite.export/export-type :graph-ontology}
```

### Key Format Details

1. **Namespace Reader Macros**: `#:user.property{...}` expands keys with prefix
2. **Unique Suffixes**: Each entity has `-SUFFIX` (e.g., `-TEST01`, `-kqRDuv2Z`)
3. **Property References**: Use full namespaced keywords `[:user.property/name-SUFFIX]`
4. **Icon Format**: `{:type :tabler-icon, :id "IconName"}` or `{:type :emoji, :id "emoji_name"}`
5. **Export Type Marker**: `:logseq.db.sqlite.export/export-type :graph-ontology`

### Minimal Test File Example

```edn
{:properties
 #:user.property{:email-TEST01
                 {:db/cardinality :db.cardinality/one,
                  :logseq.property/type :default,
                  :block/title "email",
                  :build/properties
                  #:logseq.property{:description "Email address for contact."}},
                 :telephone-TEST02
                 {:db/cardinality :db.cardinality/one,
                  :logseq.property/type :default,
                  :block/title "telephone",
                  :build/properties
                  #:logseq.property{:description "Phone number for contact."}},
                 :jobTitle-TEST03
                 {:db/cardinality :db.cardinality/one,
                  :logseq.property/type :default,
                  :block/title "jobTitle",
                  :build/properties
                  #:logseq.property{:icon {:type :tabler-icon, :id "Briefcase"},
                                    :description "Job or role title."}}}
 :classes
 #:user.class{:Person-TEST01
              {:block/title "Person",
               :build/class-properties
               [:user.property/email-TEST01
                :user.property/telephone-TEST02
                :user.property/jobTitle-TEST03],
               :build/properties
               #:logseq.property{:icon {:type :tabler-icon, :id "User"},
                                 :description "A person contact."}},
              :Organization-TEST02
              {:block/title "Organization",
               :build/class-properties
               [:user.property/email-TEST01
                :user.property/telephone-TEST02],
               :build/properties
               #:logseq.property{:icon {:type :tabler-icon, :id "Building"},
                                 :description "A business or organization."}}}
 :logseq.db.sqlite.export/export-type :graph-ontology}
```

---

## Hybrid Workflow Design

### Workflow Diagram

```
+------------------------------------------------------------------+
|                        PLUGIN WORKFLOW                            |
+------------------------------------------------------------------+
|  1. User clicks "Import Template" in plugin                      |
|                         |                                        |
|  2. Plugin fetches template from URL/marketplace                 |
|                         |                                        |
|  3. Plugin parses EDN -> PropertyDefinition[], ClassDefinition[] |
|                         |                                        |
|  4. Plugin queries existing: getAllProperties(), getAllTags()    |
|                         |                                        |
|  5. Plugin computes DIFF (new, updated, conflicts)               |
|                         |                                        |
|  6. Plugin shows PREVIEW dialog to user                          |
|     - New properties: X                                          |
|     - New classes: Y                                             |
|     - Updates: Z (conflicts highlighted)                         |
|                         |                                        |
|  7. User confirms -> Plugin generates native EDN file            |
|                         |                                        |
|  8. Plugin saves file OR copies EDN to clipboard                 |
|                         |                                        |
|  9. Plugin shows instructions: "Import via Menu -> Import -> EDN"|
|                         |                                        |
| 10. USER performs native import (menu action)                    |
|                         |                                        |
| 11. Plugin VERIFIES: queries entities, confirms import success   |
|                         |                                        |
| 12. Plugin shows confirmation with imported entity count         |
+------------------------------------------------------------------+
```

### Implementation Components

#### A. EDN Generator (New Module)

Convert `ParsedTemplate` to native Logseq EDN format:

```typescript
// src/export/edn-generator.ts
export function generateNativeEdn(template: ParsedTemplate): string {
  // 1. Generate unique suffixes for each entity
  // 2. Build property map with #:user.property{...} structure
  // 3. Build class map with #:user.class{...} structure
  // 4. Add :logseq.db.sqlite.export/export-type marker
  // 5. Serialize to EDN string
}
```

#### B. Enhanced Preview

Current `diffTemplate()` already computes:
- `newProperties`, `newClasses`
- `updatedProperties`, `updatedClasses`
- `conflicts`

Add for hybrid workflow:
- Show which entities will be created as `user.*` (not plugin-owned)
- Warn about namespace implications

#### C. File Output / Clipboard

```typescript
// Options for delivering EDN to user:
// 1. Save to file (logseq.FileStorage or download)
// 2. Copy to clipboard (navigator.clipboard.writeText)
// 3. Show in modal for manual copy
```

#### D. Import Verification

After user performs native import:

```typescript
async function verifyImport(expected: ParsedTemplate): Promise<VerificationResult> {
  const props = await logseq.Editor.getAllProperties()
  const tags = await logseq.Editor.getAllTags()

  // Match by name (case-insensitive) since suffixes will differ
  const foundProps = expected.properties.filter(p =>
    props.some(existing => existing.name === p.name.toLowerCase())
  )

  return {
    propertiesFound: foundProps.length,
    propertiesExpected: expected.properties.length,
    classesFound: ...,
    classesExpected: ...,
    success: ...
  }
}
```

---

## Comparison: Hybrid vs Current Approach

| Feature | Current (Plugin API) | Hybrid (Native Import) |
|---------|---------------------|------------------------|
| **Entity Ownership** | Plugin namespace | User namespace |
| **Icons** | Tabler only | Tabler + Emoji |
| **Descriptions** | Works | Works |
| **Class Inheritance** | Works | Works |
| **Class Properties** | Limited by ownership | Full support |
| **Preview/Diff** | Built-in | Can implement |
| **Conflict Detection** | Built-in | Can implement |
| **Automation** | Fully automated | Requires user action |
| **Modify Existing** | Only own entities | Creates new |
| **Batch Performance** | Many API calls | Single import |

### When to Use Each

**Use Hybrid (Native Import) when:**
- User wants "user-owned" entities (not tied to plugin)
- Importing large templates (batch performance)
- Need emoji icons
- First-time template setup

**Use Current (Plugin API) when:**
- Plugin needs to manage/update entities over time
- Automated sync workflows
- Incremental updates preferred

---

## Console Commands for Testing

### Verify Properties After Import

```javascript
logseq.Editor.getAllProperties().then(props => {
  const userProps = props.filter(p => p.ident?.startsWith(':user.property/'))
  console.log('User properties:', userProps.map(p => ({
    name: p.name,
    title: p.title,
    type: p[':logseq.property/type'],
    icon: p[':logseq.property/icon']
  })))
})
```

### Verify Classes After Import

```javascript
logseq.Editor.getAllTags().then(tags => {
  const userClasses = tags.filter(t => t.ident?.startsWith(':user.class/'))
  console.log('User classes:', userClasses.map(t => ({
    name: t.name,
    title: t.title,
    icon: t[':logseq.property/icon'],
    properties: t[':logseq.property.class/properties'],
    extends: t[':logseq.property.class/extends']
  })))
})
```

### Check Specific Entity

```javascript
// Get specific property by name
logseq.Editor.getProperty('email').then(console.log)

// Get specific tag by name
logseq.Editor.getTag('Person').then(console.log)
```

### List All Import Methods (Debug)

```javascript
const methods = ['importEdn', 'importOntology', 'importData', 'importBlocks', 'importPages']
methods.forEach(m => {
  const exists = typeof logseq.Editor[m] === 'function'
  console.log(`Editor.${m}: ${exists ? 'exists' : 'missing'}`)
})
```

---

## Sources

- [PR #11784 - Export and Import Graph as EDN](https://github.com/logseq/logseq/pull/11784)
- [deps/graph-parser - Graph Parser Library](https://github.com/logseq/logseq/tree/master/deps/graph-parser)
- [IEditorProxy Interface](https://logseq.github.io/plugins/interfaces/IEditorProxy.html)
- [Plugin Documentation](https://plugins-doc.logseq.com/)
- [Plugin Security Discussion #9230](https://github.com/logseq/logseq/discussions/9230)
- [Logseq DB Changelog](https://discuss.logseq.com/t/logseq-db-changelog/30013)

---

## Recommendations

1. **Keep current plugin API approach** for automated sync workflows
2. **Consider hybrid workflow** for initial template setup or large imports
3. **Document namespace implications** for users (plugin-owned vs user-owned entities)
4. **Future enhancement**: Request Logseq expose `importOntology` API to plugins
