# ADR-007 — Local search index and independent backup

Status: accepted (2026-11-27)

## Search (spec 09)

- Own inverted index (`packages/search`) instead of MiniSearch: the spec's ranking (exact title >
  title prefix > tag > url/subject > content, recency tie-break), Turkish folding (İ/I/ı/i,
  accents, NFC/NFD) with an index map for highlighting, and field-level match reporting were
  simpler to guarantee in ~300 lines than through a generic library's options. Measured in Node:
  11 000 docs indexed in 122 ms, query p95 28.6 ms (browser p95 not yet measured).
- Docs are derived from committed records only (folders, notebooks, pages, blocks; trash excluded),
  kept in sync by store change notifications; container renames re-path their blocks. The index is
  disposable and rebuilt on start. Queries never leave the device.
- Not yet indexed: dataset titles and table cell text.

## Backup (spec 17)

- ZIP (fflate 0.8.3, MIT): `manifest.json` (format version, schema version, counts, SHA-256 of
  every file), `entities/*.json` per kind, `readable/**.md` per page (tables rendered as Markdown).
  History, search index, UI state and auth are excluded. Not encrypted — the UI says so.
- Restore = inspect then write: size/entry/ratio limits (ZIP-bomb), path allowlist (no traversal,
  absolute or unexpected paths), checksum of every file, schema validation and migration of every
  record, duplicate ids and count checks. Then one transaction into a **new** workspace; if any id
  collides with existing data, every id (records, batches, internal references) is remapped.
- Attachments are not implemented yet, so backups contain no blobs.
