# 03 — Data model and invariants

## Entities
All user-owned records use UUID generated on device, workspaceId, createdAt/updatedAt UTC ISO, localRevision integer, remoteVersion nullable integer, deletedAt nullable UTC, schemaVersion. Workspace itself has id/owner binding. Dates for calendar-only fields use ISO YYYY-MM-DD, not UTC midnight. Use stable IDs, never title or index as key.

| Entity | Main fields |
|---|---|
| Workspace | id, name, locale, baseCurrency, settings, ownerBinding nullable |
| Folder | parentFolderId nullable, name, rank |
| Notebook | folderId nullable, title, icon, rank |
| Page | notebookId, title, rank, archivedAt, templateId nullable |
| Block | pageId, type, payloadVersion, payload, rank, collapsed |
| Tag | label, normalizedLabel, colorToken |
| TagAssignment | tagId, entityType, entityId |
| Favorite | entityType, entityId, rank |
| Attachment | sha256, mime, size, filename, blobKey, uploadState |
| Dataset | title, columns, revision, sourceInfo |
| DatasetRow | datasetId, rowId, rank, cells |
| FormulaDependency | sourceBlockId, outputKey, targetBlockId (derived index) |
| FxSnapshot | provider, date, base, rates, retrievedAt, quality |
| Revision | entityId, entityType, before/after or snapshot, commandId, timestamp |
| Outbox | opId, commandId, deviceId, baseVersions, operations, status |
| Conflict | entityId, localSnapshot, remoteSnapshot, baseSnapshot, status |
| SyncState | workspaceId, serverCursor, deviceId, lastSuccess |

## Core schema example
```ts
type Block<T extends string = string, P = unknown> = {
 id: string; workspaceId: string; pageId: string; type: T;
 payloadVersion: number; payload: P; rank: string; collapsed: boolean;
 createdAt: string; updatedAt: string; deletedAt: string | null;
 schemaVersion: number; localRevision: number; remoteVersion: number | null;
};
type ValueRef = { blockId: string; outputKey: string };
type CellValue = { kind: 'missing' } | { kind: 'text'; value: string } |
 { kind: 'number'; value: number } | { kind: 'decimal'; value: string } |
 { kind: 'money'; amount: string; currency: string } |
 { kind: 'date'; value: string } | { kind: 'boolean'; value: boolean };
```
Use finite number validation, decimal canonical string, currency ISO codes, allowlisted block schema. Missing distinct from zero, empty text, null. Dataset cells keyed by column ID; rows stable IDs. Unknown block preserved byte-equivalently at payload JSON value level (not whitespace), shown read-only and exportable; no coercion to empty.

## Invariants and commands
- No cross-workspace parents or references without explicit export/import. Folder cannot be descendant of itself. Page belongs to one active notebook; block belongs to one page. Active children of trashed parent hidden, not orphaned.
- Rank is lexicographic fractional ordering with deterministic ID tie-break. Insert/move allocates between neighbors; bounded rank growth triggers explicit atomic rebalance. Concurrent sync validates parent and rank updates. Never use floating point order increments.
- Commands create, rename, move, duplicate, archive, trash, restore, purge, updateBlock, updateDataset, assignTag; check workspace, expected local revision, parent, input schema, limits. Atomic subtrees for move/delete/duplicate; enforce maximum batch size and transaction rollback.
- Trash soft-deletes subtree as a recorded command with batch ID; restore only members deleted by same command, preserve older deletions. If parent missing, ask user to restore to recovered notebook/folder. Permanent purge explicit, with dependency warning; synced tombstone retained per 16.
- Duplicate page/notebook generates new IDs and remaps internal links, block outputs, dataset refs, preserving external refs if in workspace; attachment blobs can share immutable content with reference tracking. Verify all mapping before commit.

## Indexes
Dexie: by workspace + parent/rank; page/rank; workspace+deletedAt (use explicit active flag for IndexedDB indexing); tags normalized; datasetId/rank; outbox status/created sequence; sync cursor. IndexedDB cannot index null/boolean directly reliably; encode state as string/integer and test query. SQL unique constraints and composite FKs include workspace. Validate every read/import/network boundary and migration. Derived backlink/graph indexes rebuild from canonical rows.

## Tests
Reject invalid parents/cycles, duplicate IDs, negative revision, malformed dates, NaN, oversized payload, cross-workspace references. Test move/rename without broken refs, deterministic ordering, deletion restoration, copy remap, unknown payload roundtrip, and migration of old fixtures.
