# 01 — Product definition

## Problem
Existing tools tend to optimize either documents, databases or executable notebooks. Here the target is quick daily capture and structured, reusable data in one personal workspace, not a full Notion or Colab clone.

## Primary user journeys
| ID | Scenario | Expected result |
|---|---|---|
| U01 | Create University > Linkler > Satellite Systems | attendance and lecture links open directly, search by title/domain/course |
| U02 | Open draft on phone | one tap copies body, subject separately, preserves line breaks |
| U03 | Record 300 EUR cash, 200 EUR bank | exact 500 EUR total, configurable TRY conversion and 60/40 chart |
| U04 | Edit cash amount | dependent total and chart refresh without page reload |
| U05 | Capture while offline | local save, reload and retain; later sync if enabled |
| U06 | Rename/move page | references survive via stable IDs |
| U07 | Paste CSV | preview types, missing values, chart/statistics; original input recoverable |
| U08 | Delete by mistake | trash/restore or undo with explicit recovery |
| U09 | Open same note on two devices | no silent overwrite; conflict visible and recoverable |
| U10 | Export and restore workspace | preserve blocks, attachments, IDs and internal references |

## Scope
P0: nested folders, notebooks, pages, block editor, clickable links, mobile copy, quick draft, autosave, search, trash, backup, offline. P1: data tables, formula engine, stats, charts, currency, optional cloud sync, academic helpers. P2: extension sandbox, collaboration, external integrations, remote code execution, native apps, AI assistant; not part of current release. Finance is manual tracking only; not accounting or investment advice. Mail is draft only; no automatic send.

## UX principles
Fast open → fast capture → reliable retrieval. Avoid forced metadata and mandatory cloud signup. One tap on mobile should copy links/drafts, with visible feedback only after success. Reading mode opens links; editing mode changes link fields. Rich text and structured blocks coexist without user-facing JSON. Data origin, unit, currency, rate date, last save and sync status are explicit. Never disguise stale or missing values as zero. No intrusive tracking; language, theme and base currency configurable.

## Product metrics (targets, not measured)
On documented midrange device and 1k notes: create quick note in ≤3 user interactions after launch, copy in one tap, search first results p95 ≤300 ms after debounce, typing feedback p95 ≤50 ms, local save p95 ≤500 ms after debounce under typical workload. Record device/browser and fixture size; improve with profiling, not artificial timeouts. Data integrity and accessibility outrank speed.
