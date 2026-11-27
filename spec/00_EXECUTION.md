# 00 — Execution protocol

## Bootstrap
Inspect repository; if empty initialize Vite React TypeScript and pnpm workspace, otherwise map existing modules. Pin supported Node version and pnpm version; use lockfile. Configure strict TS, ESLint, formatting, Vitest, Playwright and CI. Start with local mode and sample workspace created only on explicit demo action. No secrets necessary. Document `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`, `pnpm build` (scripts must actually exist).

## Gate sequence
| Gate | Docs | Deliverable | Blocking acceptance |
|---|---|---|---|
| G0 | 01,02,20,21 | repository foundation | clean build/lint/typecheck; runnable smoke test |
| G1 | 03,04,05 | local model, commands, registry | atomic create/move/delete/undo; reload; migration test |
| G2 | 06,07,08 | usable notebook | folder→page→link/mail/text; actual copy; mobile layout |
| G3 | 09,10,17(local) | searchable notes and datasets | search update, CSV preview, backup roundtrip |
| G4 | 11,12,13 | calculation DAG, stats, charts | fixture math, dependency and cycle tests, chart updates |
| G5 | 14,15 | finance + offline PWA | currency fixture exact, offline write/reopen, cache update |
| G6 | 16,17(cloud),20 | optional sync | auth isolation, conflict, retry, restore across devices |
| G7 | 18,19 | academic and template features | no cross-reference break on duplicate; extension safety |
| G8 | 21,22,23,24 | release candidate | all applicable gates; real device checks recorded |

All later docs are design constraints from G0, even if implementation is delayed. G6 live credentials are external: implement local adapter/integration tests and mark hosted verification pending if unavailable; other independent gates may proceed. Do not call a local simulator proof of hosted security.

## Task procedure
For each doc, split into schema/domain/service/UI/test tasks. Implement vertical slice first (create/edit/read), add edge cases, then refactor. Keep UI and pure computations separately testable. Use feature flags for incomplete features and avoid showing controls that do nothing. User sees saving/saved/error status, not console-only messages. Save original data prior to migrations; dry run bulk import. At each gate record actual commands, exit codes, evidence and remaining risks. Reopen application from disk and test persistence rather than just component state.

## Priority interpretation
P0 required for applicable gate; P1 after gate baseline; P2 deferred experiments. Do not expand scope to banking, email sending, paid AI, collaboration or Python runtime before core is reliable. For ambiguity choose reversible options and write ADR; do not invent user preferences. Never commit real credentials or push/deploy on user's behalf without permission.
