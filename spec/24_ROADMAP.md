# 24 — Roadmap and backlog

## Implementation order
| Phase | P0 outcome | P1 follow-up |
|---|---|---|
| G0 | repo tooling, architecture decisions | dependency/license audit |
| G1 | storage + commands + registry | history pruning and optimization |
| G2 | notebook, text, link, mail copy | split view, richer styling |
| G3 | search, data import, backup | XLSX, web clipper |
| G4 | typed formula DAG, stats, chart | more distributions/regression |
| G5 | finance/FX/manual, PWA | transaction ledger, expense tracking |
| G6 | optional safe sync | field merge, attachment prefetch |
| G7 | academic blocks/templates | declarative extensions, citations |
| G8 | tested release, docs | performance improvements |

## MVP release boundaries
MVP-A (G0–G3 + minimum offline shell from G5): daily note utility, fast links, drafts, folder organization, local data and backup. MVP-B (G4–G5): reactive calculations, stats, charts, multi-currency, full PWA. MVP-C (G6): cross-device cloud sync with conflict handling. G7–G8 polish/advanced. Do not call G2 alone complete for requested finance feature. G6 is optional for local operation but important for effortless phone/desktop continuity. No cloud service assumption: local functionality remains fully independent.

## Future experiments (not authorized current scope)
Native wrappers, collaboration/CRDT, E2E encrypted sync, external calendar/mail integrations, AI-assisted search/summarization with consent, Jupyter-compatible execution, advanced statistical inference, full spreadsheet formulas, real-time market data, public plugins, OCR, browser extension. Each needs scope, privacy, cost and safety review. No speculative implementation before foundations.

## Risk register
| Risk | Mitigation |
|---|---|
| Overbuilding before notes usable | vertical slices, G2 usable gate |
| Data loss on mobile browser | autosave status, backup, quota handling, sync optional |
| Two sources of truth | block record canonical; derived cache disposable |
| Sync complexity | local first, command protocol, explicit conflicts |
| Wrong financial values | decimal, rate date/source, fixtures, incomplete status |
| Slow editor | focused mount, worker, profiling |
| Vendor lock-in | adapter interfaces, lossless backup, local mode |
| Dependency/hosting costs | pin versions, validate quotas, no paid dependencies by default |

## Decision log defaults
Name unspecified, Turkish UI with English option, single user, PWA first, local-first, no automatic email sending, reference FX not live, no executable code cells, no third-party arbitrary plugin runtime. These are reversible planning assumptions except core invariants; record user overrides in ADRs. No time estimate without inspecting repository and available resources.
