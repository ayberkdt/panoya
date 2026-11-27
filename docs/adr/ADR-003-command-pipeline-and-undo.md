# ADR-003 — Command pipeline, history and undo

Status: accepted (2026-11-27)

## Decision

1. **Single write path.** `WorkspaceStore.execute(command)` validates the command (Zod), then inside
   one storage transaction calls the pure planner (`packages/domain/src/planner.ts`) with a
   transaction-scoped `ReadContext`, writes every changed record (re-validated) and appends one
   `CommandLogEntry` holding before/after snapshots. Subscribers are notified after commit; other
   tabs are notified through `BroadcastChannel`.
2. **Optimistic concurrency.** `updateBlock` carries `expectedRevision`; a mismatch is a `CONFLICT`
   that the editor surfaces ("keep mine" / "take theirs") without losing the draft.
3. **Undo = inverse command, field level.** Undo inverts the latest `applied` structural command
   against the _current_ state: each change may be inverted only while the fields it modified still
   hold the values it wrote (meta fields excluded). Later unrelated edits — e.g. typing into a moved
   block — do not block undoing the move; a real divergence (purged record, re-renamed title) yields
   `CONFLICT`. Records created by the command are deleted when untouched and childless, otherwise
   moved to the trash so later typing is never lost. Redo inverts the undo entry and refreshes the
   command's "after" snapshots. A new structural command discards pending redos.
4. **What is undoable.** Structural commands (create, rename, move, duplicate, trash, restore).
   Typing (`updateBlock`) is logged as a non-undoable revision record; in-editor undo covers it.
   `purge` is never undoable.
5. **Trash batches.** Trash marks the active subtree with one `deleteBatchId`; restore brings back
   exactly that batch (older, separate deletions stay in the trash). If the original parent is gone
   or trashed, restore requires a target chosen by the user.
6. **History pruning.** The log keeps the newest 200 entries per workspace; canonical data is never
   pruned.

## Not yet

The sync outbox (spec 16) is not written; the command log is the durable change history that a
future outbox bootstrap can read.
