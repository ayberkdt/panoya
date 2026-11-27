# ADR-006 — Typed datasets, table blocks and status tracking

Status: accepted (2026-11-27)

## Decision

- **Model (spec 10).** `Dataset` (workspace-level: title, typed columns, source, `dataRevision`)
  and `DatasetRow` (rank, `cells` keyed by column id, optional `history`). A `table` block only
  references its dataset; rows never live in the block payload. IndexedDB schema v2 adds the two
  tables (additive upgrade, tested from a v1 database).
- **Cells.** Discriminated union: `missing` (absent key), `text`, `number`, `decimal` (canonical
  string), `money` (amount string + ISO currency), `date` (ISO day), `boolean`, `select`
  (stable option id). Missing is never 0, "" or false.
- **Column types.** text, number, decimal, money, boolean, date, category, **select**, **email**,
  **url**. Select columns own ordered options `{id, label, color}`; labels are unique
  (Turkish case-insensitive); colours are 9 named tokens whose text contrast was measured
  (≥ 5.85:1, light and dark). Email/URL use text cells validated by the column type (URL: http/https
  only, same rule as link blocks).
- **Commands are all-or-nothing.** `createTableBlock`, `addDatasetRows`, `updateCells` (with
  optional `appendRows` so a paste that extends the table is one transaction), `trashRows`,
  `addColumn`, `updateColumn` (options, history flag), `setColumnType` (UI previews conversions;
  remaining invalid values reject unless the user chose "missing"), `deleteColumn`. Every one is
  undoable; any invalid cell rejects the whole command.
- **Duplicating** a page or table block deep-copies its dataset (never a shared dataset).
- **Status tracking ("geriye dönük takip").** Columns with `trackHistory` (default for select;
  set on import only when the header looks like a status: durum, mail, onay, karar, sonuç…) append
  `{at, columnId, column, from, to}` to the row on every real change, capped at 100 entries per row.
  Labels are snapshotted, so history stays readable after options are renamed or removed. Tracked
  select columns get a counts bar whose chips filter the view (view state in the block payload).
- **View state** (sort, filter) lives in the table block payload and never changes stored data
  or analytics.

## Consequences

- History is part of the row and therefore part of backups and undo.
- Removing an option empties cells that used it (shown before saving, undoable).
- Windows does not render flag emoji (shown as letters); this is an OS font limitation.
