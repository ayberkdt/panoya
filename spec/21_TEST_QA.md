# 21 — Test strategy, acceptance and performance

## Layers
Unit: pure schemas, commands, rank, money, parser/AST, DAG, stats, date/unit and serializers. Property: random folder trees/moves, DAG order/cycles, decimal conversion roundtrip within rounding, import mapping, no orphan records. Integration: Dexie transaction/migration, backup/restore, outbox and fake transport with fault injection; local Supabase SQL/RPC/RLS tests when installed. E2E: Playwright Chromium, Firefox, WebKit; mobile viewport and real iPhone/Android manual verification. Accessibility: automated axe plus keyboard/screen reader manual; no critical/serious unexplained findings. Visual regression for core layout only, not substitute for behavior.

## Test matrix
| ID | Flow | Required evidence |
|---|---|---|
| T01 | Folder → notebook → page → link | persists after reload; open exact URL |
| T02 | Draft copy | body/subject separate; multiline; denial fallback |
| T03 | Offline create/edit/reopen | committed values preserved; no cloud required |
| T04 | Move/duplicate/rename | stable refs; internal remap; no cycle |
| T05 | Trash/restore/undo | subtree and older deletions correct |
| T06 | CSV import | locale, missing, quoting, cancel, validation |
| T07 | Formula graph | diamond, cycle, missing, stale worker |
| T08 | Stats | analytic fixtures, n, sample vs pop, regression |
| T09 | Finance | exact decimal, cross FX, stale/missing, liability |
| T10 | Chart | source changes, mobile layout, accessible data |
| T11 | Backup | full semantic roundtrip, hashes, malicious import |
| T12 | Sync | offline two devices, lost ACK, conflict, delete/edit |
| T13 | Auth/security | A/B/anon denial, cache isolation, XSS/AST |
| T14 | Upgrade/failure | migration fixture, quota, app update, crash recovery |
| T15 | Academic/template | equation copy, reference remap, safe defaults |

## Benchmarks (targets, not results)
Generate deterministic synthetic data: 100 notebooks/1000 pages/10k blocks; one page with 200 blocks; dataset 10k rows × 10 cols (100k cells); DAG 1000 nodes/3000 edges acyclic; 2-device sync 100 queued commands. Record browser/OS/hardware, cold vs warm, n runs, p50/p95, memory if available. Targets on documented midrange laptop: warm open common page p95 ≤800ms, typing interaction p95 ≤50ms, local save p95 ≤500ms after debounce for small block, search p95 ≤300ms after debounce, affected 100-node DAG p95 ≤200ms for simple scalar math; no long synchronous UI task >50ms in measured normal typing. For heavy jobs show progress/cancel, not fake result. Mobile separately record measurements, avoid universal promises. If missed profile and document bottleneck, do not weaken thresholds silently.

## CI and definition of done
Every PR: frozen lock install, lint, typecheck, unit/integration, build, selected E2E; full matrix before release. Coverage goal ≥85% branches for pure compute/finance/commands modules; quality and negative cases more important than coverage percentage. Keep test seeds reproducible. Flaky tests investigate, not unconditional retries. Gate complete only actual pass logs + manual checklist + known gaps. Never claim iOS device test from emulation. If environment lacks browser/database/credentials, document command/error, use available independent tests, keep impacted gate pending.
