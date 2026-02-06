# Logseq Plugin API Field Reconciliation

This document compares fields available in Logseq's native EDN export format versus what can be set through the Plugin API. It is intended to support a feature request for improved API parity, enabling plugins to fully import/export ontology definitions.

## Executive Summary

When importing ontology templates via plugins, some data is lost because the Plugin API does not support all fields that Logseq exports in its native EDN format. However, recent testing and implementation (Feb 2025) addressed many gaps.

| Category | EDN Export Fields | Plugin API Fields | Gap |
|----------|------------------|-------------------|-----|
| Property Fields | 14 | 10 | **4 fields missing** |
| Class/Tag Fields | 7 | 6 | **1 field missing** |

**Implementation Status (Feb 2025):**
- ✅ **Description field works** using namespaced key `:logseq.property/description`
- ✅ **Tabler icons IMPLEMENTED** on properties/tags via `setBlockIcon(uuid, 'tabler-icon', 'name')`
- ❌ **Emoji icons not supported** - Logseq's lookup table inaccessible to plugins

**Most Critical Remaining Gap:** Emoji icons cannot be set (only Tabler icons work); closed values (enums) cannot be created programmatically.

---

## Property Fields Comparison

### EDN Export (Native Format)

Fields exported when a user exports ontology from a Logseq DB graph:

| Field | EDN Key(s) | Description | Example Value |
|-------|------------|-------------|---------------|
| **name** | `block/title` | Property identifier | `"due-date"` |
| **type** | `logseq.property/type` | Data type | `"date"`, `"datetime"`, `"checkbox"`, `"url"`, `"page"`, `"node"`, `"number"`, `"default"` |
| **cardinality** | `db/cardinality` | Single or multiple values | `"db.cardinality/one"`, `"db.cardinality/many"` |
| **title** | `logseq.property/title` | Human-readable display name | `"Due Date"` |
| **description** | `logseq.property/description` | Documentation/help text | `"When this task is due"` |
| **hide** | `logseq.property/hide?` | Whether hidden in UI | `true`, `false` |
| **icon** | `logseq.property/icon` | Visual icon | `{:type :emoji, :id "calendar", :skins [{:native "📅"}]}` |
| **closed** | `logseq.property/closed-values` | Enum restriction flag | (presence indicates closed) |
| **closedValues** | `logseq.property/closed-values` | Allowed enum values | `[{:value "high"} {:value "medium"} {:value "low"}]` |
| **position** | `logseq.property/position` | UI ordering hint | `1`, `2`, `3` |
| **public** | `logseq.property/public?` | Visibility setting | `true`, `false` |
| **classes** | `property/classes` | Associated class names | `["Task", "Project"]` |
| **schema-version** | `schema-version` | Migration versioning | `1` |
| **default** | `logseq.property/default` | Default value | `"medium"` |

### Plugin API Support

**`Editor.upsertProperty(key, schema, opts)`** - Primary method for creating/updating properties

| Parameter | Supported | Values | Notes |
|-----------|-----------|--------|-------|
| `key` | ✅ | string | Property identifier (auto-normalized to kebab-case) |
| `schema.type` | ⚠️ Partial | `"default"`, `"number"`, `"date"`, `"checkbox"`, `"url"`, `"node"` | **Missing: `datetime`** (`node` = page reference) |
| `schema.cardinality` | ✅ | `"one"`, `"many"` | Works correctly |
| `schema.hide` | ✅ | boolean | Works correctly |
| `schema.public` | ✅ | boolean | Works correctly |
| `opts.name` | ✅ | string | Sets display title |

**Workaround: `Editor.upsertBlockProperty(uuid, key, value)`** - Set additional fields on property entity

| Field | Status | Notes |
|-------|--------|-------|
| description | ✅ Yes | Use the **full namespaced key** `:logseq.property/description` (see below) |
| schema-version | ⚠️ Partial | Can attempt to set but may not persist reliably |

**Discovery (Feb 2025):** The system description field CAN be set by using the full namespaced key:
```typescript
// ❌ WRONG - creates a user property named "description"
await logseq.Editor.upsertBlockProperty(uuid, 'description', 'My description')

// ✅ CORRECT - sets the system logseq.property/description field
await logseq.Editor.upsertBlockProperty(uuid, ':logseq.property/description', 'My description')
```
The value is stored as an entity reference (Logseq creates a new entity containing the text).

### Property API Gaps

| Missing Field | Severity | Impact | Workaround |
|---------------|----------|--------|------------|
| ~~**icon (tabler)**~~ | ✅ Implemented | ~~Cannot set icons on properties~~ | Plugin now sets Tabler icons via `setBlockIcon(uuid, 'tabler-icon', 'name')` |
| **icon (emoji)** | 🔴 Not Supported | Cannot set emoji icons on properties | None - Logseq's emoji lookup table is inaccessible; use Tabler icons instead |
| **closedValues** | 🔴 Critical | Cannot create enum/choice/select properties | None |
| **datetime type** | 🟡 Medium | Cannot create datetime properties | Use `date` type (loses time component) |
| **position** | 🟡 Medium | Cannot control UI ordering of properties | None |
| **default** | 🟡 Medium | Cannot set default values for new instances | None |
| **classes** | 🟢 Low | Cannot directly associate property with classes | Use `addTagProperty` on the class side |
| ~~**description**~~ | ✅ Resolved | ~~Cannot set system description field~~ | Use `:logseq.property/description` namespaced key |

---

## Class/Tag Fields Comparison

In Logseq DB mode, **Tags = Classes**. They are the same concept.

### EDN Export (Native Format)

| Field | EDN Key(s) | Description | Example Value |
|-------|------------|-------------|---------------|
| **name** | `block/title` | Class/tag identifier | `"Task"` |
| **parent** | `build/class-extends` | Inheritance parent | `["user.class/Entity-abc123"]` |
| **properties** | `build/class-properties` | Associated property names | `["status", "priority", "due-date"]` |
| **title** | `logseq.class/title` | Human-readable display name | `"Project Task"` |
| **description** | `logseq.property/description` | Documentation/help text | `"Represents a task in a project"` |
| **icon** | `logseq.class/icon` | Visual icon | `{:type :emoji, :id "clipboard", :skins [{:native "📋"}]}` |
| **position** | `logseq.class/position` | UI ordering hint | `1` |

### Plugin API Support

**`Editor.createTag(name, opts)`** - Create a new tag/class

| Parameter | Supported | Notes |
|-----------|-----------|-------|
| `name` | ✅ | Tag/class name |
| `opts.uuid` | ✅ | Optional: specify UUID |

**`Editor.addTagProperty(tagId, propertyIdOrName)`** - Link property to tag

| Parameter | Supported | Notes |
|-----------|-----------|-------|
| `tagId` | ✅ | Tag UUID or numeric ID |
| `propertyIdOrName` | ✅ | Property name or ID |

**`Editor.addTagExtends(tagId, parentTagIdOrName)`** - Set parent class

| Parameter | Supported | Notes |
|-----------|-----------|-------|
| `tagId` | ✅ | Tag UUID or numeric ID |
| `parentTagIdOrName` | ✅ | Parent tag name or ID |

**Workaround: `Editor.upsertBlockProperty(uuid, key, value)`**

| Field | Status | Notes |
|-------|--------|-------|
| title | ⚠️ Partial | May not persist reliably |
| description | ✅ Yes | Use the **full namespaced key** `:logseq.property/description` |

### Class/Tag API Gaps

| Missing Field | Severity | Impact | Workaround |
|---------------|----------|--------|------------|
| ~~**icon (tabler)**~~ | ✅ Implemented | ~~Cannot set icons on classes/tags~~ | Plugin now sets Tabler icons via `setBlockIcon(uuid, 'tabler-icon', 'name')` |
| **icon (emoji)** | 🔴 Not Supported | Cannot set emoji icons on classes/tags | None - Logseq's emoji lookup table is inaccessible; use Tabler icons instead |
| **title** | 🔴 Not Supported | Cannot set display name different from identifier | None - `:logseq.class/title` blocked by plugin ownership restriction (tested Feb 2025) |
| ~~**description**~~ | ✅ Resolved | ~~Cannot set system description field~~ | Use `:logseq.property/description` namespaced key |
| **position** | 🟢 Low | Cannot control UI ordering in class list | None |

---

## Icon Setting - Implementation Status

**Implementation (Feb 2025):** The plugin now sets Tabler icons on properties and tags during import. Emoji icons are parsed but skipped.

### What's Implemented

**Tabler Icons** - Now set automatically during import/update:
```typescript
// In ontology-api.ts - setTablerIcon helper function
// Called in createProperty(), updateProperty(), createClassWithTagAPI(), updateClass()

// Example: Property with tabler icon in template
const propDef = {
  name: 'priority',
  type: 'default',
  icon: 'star',
  iconType: 'tabler-icon'  // ✅ Will be set during import
}

// Example: Class with tabler icon in template
const classDef = {
  name: 'Task',
  icon: 'clipboard-list',
  iconType: 'tabler-icon'  // ✅ Will be set during import
}
```

### What's Not Supported

**Emoji Icons** - Parsed from templates but NOT applied:
```typescript
// Example: Property with emoji icon in template
const propDef = {
  name: 'due-date',
  icon: 'calendar',
  iconType: 'emoji'  // ❌ Will be skipped - logged but not set
}

// All emoji formats fail with Logseq's setBlockIcon API:
await logseq.Editor.setBlockIcon(uuid, 'emoji', 'rocket')     // ❌ "Can't find emoji for rocket"
await logseq.Editor.setBlockIcon(uuid, 'emoji', '🚀')         // ❌ "Can't find emoji for 🚀"
await logseq.Editor.setBlockIcon(uuid, 'emoji', ':rocket:')   // ❌ "Can't find emoji for :rocket:"
```

**Root Cause:** Logseq's emoji lookup table (used by `setBlockIcon`) is internal and not accessible to plugins. The lookup expects emoji identifiers in a proprietary format.

### Behavior During Import

1. Template with **Tabler icon** → Icon is set via `setBlockIcon(uuid, 'tabler-icon', iconName)`
2. Template with **emoji icon** → Icon is logged and skipped (no error, just warning in debug logs)
3. Template with **no icon** → No icon operation attempted

---

## Proposed API Enhancements

### High Priority (Required for ontology import parity)

#### 1. Extend `upsertProperty` schema

```typescript
upsertProperty(key: string, schema?: {
  // Existing (keep as-is)
  cardinality?: "many" | "one";
  hide?: boolean;
  public?: boolean;
  type?: "default" | "number" | "node" | "date" | "checkbox" | "url";

  // Requested additions
  type?: "default" | "number" | "node" | "date" | "datetime" | "checkbox" | "url"; // Add datetime
  description?: string;
  icon?: { type: "emoji" | "tabler-icon"; id: string };
  closedValues?: Array<{
    value: string;
    icon?: { type: "emoji" | "tabler-icon"; id: string };
    description?: string
  }>;
  default?: unknown;
  position?: number;
}, opts?: {
  name?: string
}): Promise<IEntityID>
```

#### 2. Extend `createTag` options

```typescript
createTag(name: string, opts?: {
  uuid?: string;  // Existing

  // Requested additions
  title?: string;
  description?: string;
  icon?: { type: "emoji" | "tabler-icon"; id: string };
  position?: number;
}): Promise<PageEntity>
```

#### 3. Fix `setBlockIcon` for schema entities

**Option A:** Make `setBlockIcon` work universally for all entity types including properties and tags.

**Option B:** Add dedicated methods:
```typescript
setPropertyIcon(propertyIdOrName: string | number, iconType: 'emoji' | 'tabler-icon', iconId: string): Promise<void>
setTagIcon(tagIdOrName: string | number, iconType: 'emoji' | 'tabler-icon', iconId: string): Promise<void>
```

### Medium Priority

#### 4. Add `upsertTag` method (idempotent create/update)

```typescript
upsertTag(name: string, opts?: {
  title?: string;
  description?: string;
  icon?: { type: "emoji" | "tabler-icon"; id: string };
  position?: number;
  properties?: string[];  // Property names to associate
  parent?: string;        // Parent tag name
}): Promise<IEntityID>
```

This would mirror `upsertProperty` semantics: create if not exists, update if exists.

---

## Use Case: Ontology Marketplace

### Current Workflow (Broken)

1. User creates ontology in Graph A with classes, properties, icons, enum values
2. User exports ontology as EDN (all fields preserved)
3. User shares EDN file via marketplace
4. Another user imports via plugin into Graph B
5. **Result:** Icons missing, enums become text fields, descriptions lost, ordering random

### Desired Workflow

1-3. (Same as above)
4. Another user imports via plugin into Graph B
5. **Result:** Full ontology preserved including icons, enums, descriptions, ordering

---

## Impact Assessment

Without these API enhancements, plugins cannot:

| Capability | Impact | Affected Users |
|------------|--------|----------------|
| **Preserve visual identity** | Icons lost during import; ontologies look "broken" | All importers |
| **Create choice/enum properties** | Must manually recreate closed values | Users with status fields, priorities, categories |
| **Document the schema** | Descriptions lost; users must re-document | All importers |
| **Maintain UI ordering** | Properties/classes appear in random order | All importers |
| **Support datetime data** | Must downgrade to date-only | Users with scheduling, timestamps |

This significantly limits the usefulness of ontology sharing and marketplace features in the Logseq ecosystem.

---

## References

- **Logseq Plugin API Reference**: https://logseq.github.io/plugins/interfaces/IEditorProxy.html
- **DB Graph Documentation**: https://docs.logseq.com/#/page/db%20graphs
- **Schema Reference**: https://docs.logseq.com/#/page/properties
- **Classes Reference**: https://docs.logseq.com/#/page/classes

---

## Appendix: Field Mapping Summary

### Properties

| EDN Key | Plugin API | Status |
|---------|------------|--------|
| `block/title` | `key` parameter | ✅ |
| `logseq.property/type` | `schema.type` | ⚠️ Missing datetime (`node` = page ref) |
| `db/cardinality` | `schema.cardinality` | ✅ |
| `logseq.property/title` | `opts.name` | ✅ |
| `logseq.property/description` | `upsertBlockProperty` with `:logseq.property/description` | ✅ |
| `logseq.property/hide?` | `schema.hide` | ✅ |
| `logseq.property/public?` | `schema.public` | ✅ |
| `logseq.property/icon` | `setBlockIcon` | ✅ Tabler icons implemented, emojis not supported |
| `logseq.property/closed-values` | — | ❌ |
| `logseq.property/position` | — | ❌ |
| `logseq.property/default` | — | ❌ |
| `property/classes` | `addTagProperty` (reverse) | ⚠️ |

### Classes/Tags

| EDN Key | Plugin API | Status |
|---------|------------|--------|
| `block/title` | `name` parameter | ✅ |
| `build/class-extends` | `addTagExtends` | ✅ |
| `build/class-properties` | `addTagProperty` | ✅ |
| `logseq.class/title` | — | ❌ Blocked by ownership restriction |
| `logseq.property/description` | `upsertBlockProperty` with `:logseq.property/description` | ✅ |
| `logseq.class/icon` | `setBlockIcon` | ✅ Tabler icons implemented, emojis not supported |
| `logseq.class/position` | — | ❌ |
