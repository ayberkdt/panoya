# ADR-008 — Visual identity and interaction patterns

Status: accepted (2026-11-27). User decision: Panoya gets **its own palette** (not Paritera's
lilac/violet); structural patterns may be borrowed from Paritera.

## Identity

- Warm paper canvas (`#f4f1ea` / dark `#141917`), a white page "sheet" with a soft ink-tinted
  shadow, one accent: deep sea green (`#0e6b62` / dark `#5fd0bf`). Shadows are tinted with the ink
  colour, never neutral grey.
- Budget (ux-yasalari): 5 font sizes, 2 button styles (filled primary, ghost), 1 accent, 2 shadows,
  4 radii (8 controls, 10 buttons, 14 sheet/cards/menus/dialogs, pill).
- Section labels are small uppercase "eyebrows"; titles use the display face of the system font
  (Segoe UI Variable on Windows; no web font is downloaded).
- Contrast is a **build gate**: `scripts/check-contrast.mjs` parses `tokens.css` and checks 50
  pairs (text ≥ 4.5:1, form borders and focus ≥ 3:1, every option badge), light and dark;
  `corepack pnpm check` fails on any miss.
- Status option colours follow meaning when a label is recognised (done/approved green,
  rejected red, waiting yellow, sent/in progress blue, not done/not sent grey); others rotate.

## Patterns adopted from Paritera (behaviour, not look)

| Paritera decision                                                                               | Panoya implementation                                                                                                                                    |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page behind a popup must not scroll                                                             | `app/scrollLock.ts`, reference-counted; used by dialogs, menus/bottom sheets, the phone drawer (unit + E2E tested)                                       |
| Waiting feedback thresholds (NN/g): nothing < 400 ms, more copy at 3 s / 8 s, a way out at 10 s | `app/delayedBusy.ts` + `BusyNote`; backup export/inspect/restore, table creation, search index; cancel only where abandoning is safe (backup inspection) |
| Phone bottom navigation with safe-area padding                                                  | 4 items: Pages, Search, Quick note (centre, primary), Inbox; 44 px+ targets                                                                              |
| Primary action is the only saturated fill                                                       | kept (page: "Blok ekle"; shell: "Hızlı not")                                                                                                             |

Not adopted yet: one-time product tour, planned-vs-actual status logic (fits the G5 budget work).
