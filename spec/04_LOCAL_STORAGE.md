# 04 — Local persistence, history and recovery

## Repository and transactions
Dexie versioned schema, database namespace per local profile/account. Local mode works without sign-in. On every command validate outside transaction then recheck revisions/relations inside. Atomic write entities + revision + outbox (only sync-enabled workspace, or durable change log for future bootstrap). Do not await network inside IndexedDB transaction. Use repository notifications/liveQuery for other tabs; index and chart refresh after commit. Handle blocked database upgrade, close/reload older tabs only after save. Never use localStorage for note payloads.

## Autosave
Typing buffer in editor; update dirty state immediately, debounce ~300 ms and max wait 2 s; flush on blur/navigation and when visibility changes where feasible. Each saved update captures revision. Serialize writes per block, retry transient errors with bounded backoff; on concurrent version mismatch preserve draft and show resolution. Do not assume page unload guarantees async save. Show states: editing, saving, saved locally, sync pending, error, conflict. Failed save retains in-memory draft and offers copy/export; not green check. For power loss before commit, unsaved text may be lost; document honestly. On app boot recover durable drafts/outbox.

## History
Editor-local undo for uncommitted input; global command history for committed structural actions. Undo creates inverse command (not time travel), validates latest revision, and syncs; on external edits show conflict or disable unsafe inverse. Redo only valid after no divergent command. Keep 50 recent command groups as initial local target, daily page snapshots configurable, prune only old history not canonical content. Trash retention default 30 days for prompt; no auto purge in MVP. Manual export independent of sync.

## Storage failure
Estimate quota; optionally request persistent storage when user opts in (not guaranteed). On QuotaExceededError do not delete notes; reject transaction, show usage, offer backup and attachment cleanup. On schema migration failure leave old DB intact if possible, surface export/recovery, never silently reset. Record backup/export and restore behavior, no claim browser local data is permanent; browser eviction, private browsing, user clearing can remove data. Service worker cache not canonical storage.

## Tasks & acceptance
Implement repository adapters (memory and Dexie), migrations from v1 fixture, transaction wrapper, revision log, autosave scheduler, multiple-tab notifications, trash, recovery UI. Fault injection: fail midway through page duplicate, fail quota during block update, reopen after save, concurrent edit in two tabs, migration interrupted, upgrade blocked. No partial command state; recoverable failures visible. Test actual Chromium and WebKit; fake IndexedDB only unit-level evidence.
