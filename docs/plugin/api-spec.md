# Plugin API Specification

> **Issue:** #3 - Design Plugin API for Ontology Import/Sync
> **Status:** Complete

## Overview

This document specifies the public API and internal architecture for the Logseq Ontology Sync Plugin.

## Plugin Configuration

### Settings Schema

```typescript
interface PluginSettings {
  // Template source configuration
  defaultTemplatePath: string
  templateSources: TemplateSource[]

  // Sync behavior
  autoSync: boolean
  syncInterval: number  // minutes, 0 = disabled
  syncOnGraphOpen: boolean

  // Conflict handling
  conflictStrategy: ConflictStrategy
  showPreview: boolean

  // Advanced
  debugMode: boolean
  maxHistoryEntries: number
}

type ConflictStrategy = 'ask' | 'keep-local' | 'use-source' | 'smart-merge'
```

### Default Configuration

```typescript
const defaultSettings: PluginSettings = {
  defaultTemplatePath: '',
  templateSources: [],
  autoSync: false,
  syncInterval: 0,
  syncOnGraphOpen: false,
  conflictStrategy: 'ask',
  showPreview: true,
  debugMode: false,
  maxHistoryEntries: 50
}
```

## Template Source Specification

### Source Types

```typescript
type TemplateSourceType = 'local' | 'url' | 'git'

interface TemplateSource {
  id: string           // Unique identifier
  type: TemplateSourceType
  name: string         // Display name
  path: string         // File path, URL, or Git URL
  enabled: boolean
  lastSync?: string    // ISO 8601 timestamp
}
```

### Local File Source

```typescript
interface LocalSource extends TemplateSource {
  type: 'local'
  path: string  // Absolute or relative path
  // Example: '/Users/me/templates/ontology.edn'
  // Example: './templates/ontology.edn' (relative to graph)
}
```

### URL Source

```typescript
interface UrlSource extends TemplateSource {
  type: 'url'
  path: string  // HTTPS URL
  // Example: 'https://example.com/ontology.edn'

  // Optional authentication
  headers?: Record<string, string>
}
```

### Git Repository Source (Future)

```typescript
interface GitSource extends TemplateSource {
  type: 'git'
  path: string      // Git clone URL
  branch?: string   // Default: 'main'
  filePath: string  // Path within repo
  // Example: 'https://github.com/org/repo.git'
}
```

## Import Workflow

### Workflow Stages

```
SELECT → FETCH → PARSE → VALIDATE → PREVIEW → IMPORT → COMPLETE
```

### Stage Details

#### 1. SELECT

User chooses template source:
- Pick from registered sources
- Browse for local file
- Enter URL manually

```typescript
interface SelectStageResult {
  source: TemplateSource
  options: ImportOptions
}

interface ImportOptions {
  dryRun: boolean
  conflictStrategy: ConflictStrategy
  classFilter?: string[]  // Import specific classes only
  propertyFilter?: string[]
}
```

#### 2. FETCH

Retrieve template content:

```typescript
interface FetchStageResult {
  content: string       // Raw EDN content
  checksum: string      // SHA-256 hash
  fetchedAt: string     // ISO 8601
  size: number          // Bytes
}

async function fetchTemplate(source: TemplateSource): Promise<FetchStageResult>
```

#### 3. PARSE

Parse EDN to JavaScript:

```typescript
interface ParseStageResult {
  template: OntologyTemplate
  parseTime: number  // milliseconds
}

function parseTemplate(content: string): ParseStageResult
```

#### 4. VALIDATE

Validate template structure:

```typescript
interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

interface ValidationError {
  code: string
  message: string
  path?: string  // JSONPath to error location
}

interface ValidationWarning {
  code: string
  message: string
  suggestion?: string
}
```

Validation rules:
- Schema version compatibility
- Required fields present
- UUID format valid
- Property types valid
- No circular class inheritance
- No duplicate names/UUIDs

#### 5. PREVIEW

Show changes before applying:

```typescript
interface PreviewResult {
  summary: {
    newClasses: number
    modifiedClasses: number
    deletedClasses: number
    newProperties: number
    modifiedProperties: number
    deletedProperties: number
    conflicts: number
  }

  changes: ChangeItem[]
  conflicts: ConflictItem[]
}

interface ChangeItem {
  type: 'class' | 'property'
  action: 'create' | 'update' | 'delete'
  name: string
  details: Record<string, unknown>
}

interface ConflictItem {
  type: 'class' | 'property'
  name: string
  field: string
  localValue: unknown
  sourceValue: unknown
  autoResolution?: 'keep-local' | 'use-source'
}
```

#### 6. IMPORT

Apply changes to graph:

```typescript
interface ImportResult {
  success: boolean
  applied: {
    classesCreated: number
    classesUpdated: number
    propertiesCreated: number
    propertiesUpdated: number
  }
  skipped: SkippedItem[]
  errors: ImportError[]
  duration: number  // milliseconds
}

interface SkippedItem {
  type: 'class' | 'property'
  name: string
  reason: string
}

interface ImportError {
  type: 'class' | 'property'
  name: string
  error: string
}
```

#### 7. COMPLETE

Finalize and record:
- Save metadata
- Update history
- Show summary notification

## Sync Mechanism

### Sync Modes

| Mode | Trigger | Use Case |
|------|---------|----------|
| Manual | User action | Controlled updates |
| Automatic | Graph open | Stay current |
| Scheduled | Timer | Background updates |

### Sync Process

```typescript
interface SyncCheckResult {
  sourceId: string
  hasUpdates: boolean
  sourceChecksum: string
  localChecksum: string
  lastSyncedAt: string
}

interface SyncResult extends ImportResult {
  syncType: 'manual' | 'auto' | 'scheduled'
  updateType: 'full' | 'incremental'
}

// Check for updates
async function checkForUpdates(sourceId: string): Promise<SyncCheckResult>

// Perform sync
async function syncTemplate(
  sourceId: string,
  options?: SyncOptions
): Promise<SyncResult>

interface SyncOptions extends ImportOptions {
  force?: boolean  // Ignore checksum, always sync
}
```

### Update Detection

```
┌─────────────────────────────────────────────────────────────┐
│                    Update Detection                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Source Checksum  ──┬── Same ──▶ No updates                 │
│        vs          │                                        │
│  Local Checksum   ──┴── Different ──▶ Updates available     │
│                                                             │
│  Change Analysis:                                           │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Source Changes  │  │  Local Changes  │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │                    │                            │
│           ▼                    ▼                            │
│  ┌─────────────────────────────────────────┐                │
│  │           Three-Way Diff                │                │
│  │  (Source vs Snapshot vs Current)        │                │
│  └─────────────────────────────────────────┘                │
│                       │                                     │
│       ┌───────────────┼───────────────┐                     │
│       ▼               ▼               ▼                     │
│  Source-only     Both changed    Local-only                 │
│  Auto-apply      = Conflict      Preserve                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Conflict Resolution

### Conflict Types

| Type | Description | Example |
|------|-------------|---------|
| Value | Same field, different values | Property type changed |
| Structure | Schema differences | Class hierarchy changed |
| Deletion | Item removed in one side | Class deleted locally |
| Addition | Item added in both | Same name, different UUID |

### Resolution Strategies

#### Ask (Default)

Prompt user for each conflict:

```typescript
interface ConflictPrompt {
  conflict: ConflictItem
  options: ['keep-local', 'use-source', 'skip']
  recommendation?: 'keep-local' | 'use-source'
}
```

#### Keep Local

Always preserve local values:

```typescript
function resolveKeepLocal(conflict: ConflictItem): Resolution {
  return {
    action: 'keep',
    value: conflict.localValue
  }
}
```

#### Use Source

Always use source values:

```typescript
function resolveUseSource(conflict: ConflictItem): Resolution {
  return {
    action: 'update',
    value: conflict.sourceValue
  }
}
```

#### Smart Merge

Attempt automatic merge:

```typescript
function resolveSmartMerge(conflict: ConflictItem): Resolution {
  // Merge arrays (union)
  if (Array.isArray(conflict.localValue) && Array.isArray(conflict.sourceValue)) {
    return {
      action: 'merge',
      value: [...new Set([...conflict.localValue, ...conflict.sourceValue])]
    }
  }

  // Non-mergeable: fall back to ask
  return { action: 'ask' }
}
```

### Conflict Resolution Flow

```
┌──────────────────────────────────────────────────────────────┐
│                  Conflict Resolution Flow                    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Conflict Detected                                          │
│          │                                                   │
│          ▼                                                   │
│   ┌──────────────────┐                                       │
│   │ Check Strategy   │                                       │
│   └────────┬─────────┘                                       │
│            │                                                 │
│   ┌────────┼────────┬────────────┬────────────┐              │
│   │        │        │            │            │              │
│   ▼        ▼        ▼            ▼            ▼              │
│  ask   keep-local use-source smart-merge  per-type          │
│   │        │        │            │            │              │
│   │        │        │            │            │              │
│   ▼        ▼        ▼            ▼            ▼              │
│ Prompt   Keep     Apply      Try merge    Route by          │
│  User    Local    Source     or ask       type              │
│   │        │        │            │            │              │
│   └────────┴────────┴────────────┴────────────┘              │
│                      │                                       │
│                      ▼                                       │
│              Apply Resolution                                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## Metadata Tracking

### Template Metadata

```typescript
interface TemplateMetadata {
  // Source information
  sourceId: string
  sourceType: TemplateSourceType
  sourcePath: string

  // Version tracking
  version?: string          // Semantic version if available
  checksum: string          // SHA-256 of content
  schemaVersion: string     // Template schema version

  // Timestamps
  importedAt: string        // First import
  lastSyncedAt: string      // Most recent sync
  lastModifiedAt?: string   // Source modification time

  // Statistics
  classCount: number
  propertyCount: number
}
```

### Import History

```typescript
interface HistoryEntry {
  id: string
  templateId: string
  timestamp: string
  action: 'import' | 'sync' | 'rollback'
  result: ImportResult
  snapshot?: string  // Serialized state before change
}

// History operations
function getHistory(templateId?: string): HistoryEntry[]
function addHistoryEntry(entry: HistoryEntry): void
function clearHistory(olderThan?: string): void
```

### Snapshot System

```typescript
interface Snapshot {
  id: string
  templateId: string
  timestamp: string
  content: string  // Serialized OntologyTemplate
  checksum: string
}

// Snapshot operations
async function createSnapshot(templateId: string): Promise<Snapshot>
async function restoreSnapshot(snapshotId: string): Promise<ImportResult>
async function listSnapshots(templateId: string): Promise<Snapshot[]>
async function deleteSnapshot(snapshotId: string): Promise<void>
```

## Module Architecture

```
src/
├── parser/
│   ├── edn-parser.ts      # EDN parsing/encoding
│   └── validator.ts       # Template validation
│
├── import/
│   ├── fetcher.ts         # Source fetching
│   ├── importer.ts        # Import orchestration
│   └── differ.ts          # Change detection
│
├── sync/
│   ├── sync-engine.ts     # Sync orchestration
│   ├── scheduler.ts       # Scheduled sync
│   └── update-checker.ts  # Update detection
│
├── conflict/
│   ├── detector.ts        # Conflict detection
│   ├── resolver.ts        # Resolution logic
│   └── strategies/        # Strategy implementations
│       ├── ask.ts
│       ├── keep-local.ts
│       ├── use-source.ts
│       └── smart-merge.ts
│
├── metadata/
│   ├── store.ts           # Metadata persistence
│   ├── history.ts         # History management
│   └── snapshot.ts        # Snapshot operations
│
├── api/
│   └── logseq-api.ts      # Logseq API wrappers
│
├── ui/
│   ├── components.ts      # UI utilities
│   ├── dialogs/           # Dialog components
│   └── panels/            # Panel components
│
└── utils/
    ├── logger.ts          # Logging
    ├── checksum.ts        # Hash utilities
    └── errors.ts          # Error types
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Support multiple source types | Users need flexibility (local, URL, Git) |
| Default to "ask" conflict strategy | Safety first, prevent data loss |
| Enable preview by default | Transparency before making changes |
| Use snapshot-based rollback | Simplest, most reliable rollback mechanism |
| Store metadata in plugin state | Avoid polluting user graph |
| Batch operations for large imports | Performance for 600+ classes |
| Three-way diff for sync | Accurate conflict detection |

## Error Handling

### Error Types

```typescript
class OntologySyncError extends Error {
  code: string
  details?: Record<string, unknown>
}

// Specific errors
class FetchError extends OntologySyncError {}
class ParseError extends OntologySyncError {}
class ValidationError extends OntologySyncError {}
class ImportError extends OntologySyncError {}
class ConflictError extends OntologySyncError {}
```

### Error Codes

| Code | Description |
|------|-------------|
| `FETCH_FAILED` | Unable to retrieve template |
| `FETCH_TIMEOUT` | Request timed out |
| `PARSE_INVALID_EDN` | EDN syntax error |
| `PARSE_INVALID_STRUCTURE` | Schema mismatch |
| `VALIDATE_MISSING_FIELD` | Required field missing |
| `VALIDATE_INVALID_TYPE` | Type mismatch |
| `IMPORT_FAILED` | General import failure |
| `IMPORT_PARTIAL` | Some items failed |
| `CONFLICT_UNRESOLVED` | Conflict not handled |

## Public API Summary

```typescript
// Main plugin API
interface OntologySyncPlugin {
  // Import operations
  importTemplate(source: TemplateSource, options?: ImportOptions): Promise<ImportResult>
  previewImport(source: TemplateSource): Promise<PreviewResult>

  // Sync operations
  checkForUpdates(sourceId: string): Promise<SyncCheckResult>
  syncTemplate(sourceId: string, options?: SyncOptions): Promise<SyncResult>

  // Source management
  addSource(source: TemplateSource): Promise<void>
  removeSource(sourceId: string): Promise<void>
  listSources(): TemplateSource[]

  // History & rollback
  getHistory(sourceId?: string): HistoryEntry[]
  rollback(historyEntryId: string): Promise<ImportResult>

  // Settings
  getSettings(): PluginSettings
  updateSettings(settings: Partial<PluginSettings>): void
}
```
