# ADR-009 — Wallet and table statistics

Status: accepted (2026-11-27). User request: statistics for tables, a wallet as one of the
defaults that builds its statistics from the entries, no backend wording on screen.

## Decisions

- **No schema change.** A wallet is recognised from its columns (`packages/data` `detectWallet`):
  a money (or decimal) column plus a choice column with an income and an expense option
  ("Gelir"/"Gider", "Income"/"Expense", "Maaş", "Ödeme" …, folded for Turkish). A wallet the user
  builds by hand behaves like the template; old data and backups are untouched.
- **Exact arithmetic.** Sums, means and the balance use `BigInt` on the canonical decimal strings
  (`packages/data/src/stats.ts`), never floats: 0,10 + 0,20 = 0,30. Means round half away from
  zero to max(scale, 2) decimals. The UI only formats (`Intl.NumberFormat`).
- **Entry form instead of grid typing.** "Gider ekle" / "Gelir ekle" open a four-field form
  (amount required; date defaults to today in local time; category preselected; Enter saves).
- **Charts (datawiz brief in PROGRESS).** Expense per category: sorted horizontal bars on a shared
  zero baseline, direct labels, light fill with a dark edge in the category's option colour (the
  same colour as its badge in the table). Last six months: net bars diverging from a zero line,
  compact signed labels on every bar; income green / spending orange (CVD ΔE00 ≥ 15; sign and
  label carry the meaning in greyscale). Checked against `dw.grafik` + `dw.kaydet`: 0 HATA.
- **Generic statistics.** Any non-wallet table shows total, average, lowest and highest under each
  number or money column.
- **Templates.** "Tablo oluştur" opens with three cards (empty, tracker, wallet); "Cüzdan" is also
  a block-picker shortcut that creates the wallet at once. Wallet currency: TRY for Turkish,
  the workspace base currency otherwise.
- **Readable cells.** The grid shows dates in the reader's format and money grouped with two
  decimals; editing, copying and export keep the stored value.
- **Plain language.** Backup, import and search messages no longer mention JSON, manifest,
  checksums, schemas, file paths, ISO codes or query syntax; search filters are chips that add
  block types to the query invisibly (typed `tag:`/`type:` still works and still reports errors).
