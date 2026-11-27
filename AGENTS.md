# Coding agent instructions

The full rule set is in [`spec/AGENTS.md`](spec/AGENTS.md) (copied from the specification
package, unchanged). Read `spec/README.md` and `spec/00_EXECUTION.md` first and follow the gate
order. Project-specific notes:

- Package manager: `corepack pnpm …` (pnpm 12.23.0 pinned). Root scripts do not require a global
  `pnpm` binary.
- Writes go through `WorkspaceStore.execute(command)` only. The web app must not import `dexie`
  (enforced by ESLint); `packages/domain` and `packages/blocks` must not import React, Tiptap,
  Dexie or browser globals (enforced by ESLint).
- New block type = definition in `packages/blocks` + UI adapter entry in
  `apps/web/src/features/blocks/catalog.tsx` + tests. No switch statements elsewhere.
- Record decisions in `docs/adr/`, evidence in `PROGRESS.md`. Never mark a gate passed without
  command output; list unverified items explicitly.
- No Claude/Anthropic attribution lines in commits or files (user rule).
