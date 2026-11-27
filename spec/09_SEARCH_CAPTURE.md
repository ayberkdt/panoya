# 09 — Search, quick capture, labels and backlinks

## Search
Local index derived from committed canonical entities; index page/notebook/folder titles, richText plain text, Markdown, link title/domain, mail subject/body, checklist, attachment filenames, dataset titles; not raw binary or auth secrets. Use lightweight client index (choose MiniSearch or equivalent after measuring). Incremental update keyed by entity revision, rebuild on version mismatch, batch large imports in Worker. Do not index trash by default; explicit filter. Normalize Unicode NFC, Turkish locale-aware casing, optionally accent-insensitive secondary key without collapsing exact match. Ranking: exact title > prefix title > tag > content; recency as small tie-break. Highlight sanitized snippets; show path, entity type, matched field. Debounce 100–150 ms, cancel stale queries. Queries: free text, tag:foo, type:link, in:university, before/after date, is:favorite; parse errors helpful. Do not send queries to external service.

## Capture
Global New / Quick capture opens sheet with text or URL, default Inbox notebook/page created transactionally on first use. One submit saves local item before confirmation. Can assign notebook later without changing block ID. Optional daily note page created idempotently by local calendar date; daily title stable via date key. Recent history per device; pin page/folder/notebook; tags many-to-many, normalized unique per workspace, safe merge. Bulk move/tag uses transaction and count confirmation. Web Share Target only as P2 where supported; ordinary paste works everywhere.

## References
Page reference block uses stable target ID; backlinks derived from page references, rich text internal links and formula refs separately, not fuzzy guessing. Show missing/deleted target and navigate to trash when possible. `[[title]]` autocomplete resolves exact selected ID; duplicate names require breadcrumb. Link graph view optional, not MVP. Rename/move must update displayed path but not target ID. Do not follow external URL automatically.

## Acceptance
Index updates after edit/delete/restore/rename and sync; Turkish I/İ/ı/i tests, duplicates with different paths, unknown block text fallback, stale query response ignored. At least 1k synthetic pages benchmark; search disabled until index ready with honest indicator. Quick capture offline and reload, idempotent daily page two tabs, backlinks broken/restored, no external search network.
