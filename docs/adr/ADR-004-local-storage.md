# ADR-004 — IndexedDB schema and record migrations

Status: accepted (2026-11-27)

## Decision

- Dexie 4.4.7, database `panoya-local` (one namespace per local profile; account namespaces come
  with sync). Tables: `workspaces`, `folders`, `notebooks`, `pages`, `blocks`, `commandLog`,
  `meta`, `migrationBackup`.
- IndexedDB cannot index `null`: root-level children are read through the `workspaceId` index and
  filtered. `deleteBatchId` is set only while a record is trashed, so its index contains exactly the
  trash. Every record also carries `trashed: 0 | 1` kept consistent with `deletedAt` by schema.
- Every read and write is validated with the domain Zod schemas.
- **Record migrations** (`packages/storage/src/migrations.ts`) are pure steps keyed by
  `schemaVersion`. On open, rows older than the current version are rewritten once in a single
  transaction, after copying the original rows into `migrationBackup`. Records from a newer app
  version are refused (`UNSUPPORTED`), never downgraded. Tested with the synthetic
  `fixtures/legacy-v0-records.json`.
- Blocked upgrades surface a recovery screen; a `versionchange` from a newer tab reloads this tab.
- `localStorage` holds only per-device UI state (last page, tree expansion, UI language), never
  note content.

## Evidence limits

Unit tests use `fake-indexeddb` (unit-level evidence only). Real-browser persistence is covered by
Playwright on Microsoft Edge (Chromium). WebKit/Firefox and quota-exceeded fault injection are not
yet tested.
