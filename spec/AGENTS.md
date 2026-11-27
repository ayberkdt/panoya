# Coding agent instructions

Read README and 00_EXECUTION first. Implement numbered specifications in dependency order. Use the existing repository conventions if they do not contradict invariants; record all deviations as ADRs. User-visible UI defaults to Turkish, with English localization. Code identifiers, tests and technical docs may be English.

- Do not create a mock-only UI and claim functionality; implement storage, commands and actual tests.
- Do not delete existing work or overwrite untracked files. Inspect git status and existing code before changes. Never force push or deploy without explicit authorization.
- No secrets, account IDs, real personal balances or private mail content in repo. Use synthetic fixtures. Never require a paid service for local mode. No destructive cloud migrations automatically.
- Strict TypeScript, runtime validation at trust boundaries, typed errors, deterministic pure domain functions, accessible UI, minimal dependencies.
- All writes through domain commands and repository transactions. No component directly mutates DB, no duplicate source of truth, no eval/new Function or untrusted plugin execution.
- For each feature: implement, unit/integration test, connect UI, add E2E when appropriate, run lint/typecheck/build/test, update PROGRESS. Do not fabricate command results. If tests cannot run, record exact reason and continue independent work only.
- Use no silent data loss: unknown blocks, migration failures, conflicts, failed saves and invalid inputs need recovery paths.
- Keep working without asking for nonessential preferences; use reversible defaults. Stop or isolate tasks needing credentials, real external actions, ambiguous destructive changes or unresolved integrity issues.
- Changes should be small and reviewable. Add ADRs for new dependencies or architecture changes, not just notes in chat.
