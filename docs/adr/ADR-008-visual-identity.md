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

## v2 (2026-11-27): logo, stronger components, copy pass

- **Logo.** One note sheet shaped like a "P", top-right corner folded in amber, on a pine tile
  (`#0b6a5a`). The letter's counter reads as a line of text. A first sketch (tall card + short
  card side by side) was dropped because it resembles the Trello mark. Sources of truth:
  `apps/web/public/favicon.svg`, `apps/web/src/components/Logo.tsx`; PNG icons (180/192/512,
  maskable) come from `node scripts/render-icons.mjs`; `manifest.webmanifest` makes the app
  installable to a home screen. Amber is a brand colour only, never an interface accent.
- **Tokens.** Accent `#0b6a5a` (dark `#5ccfb7`), new `--surface-sunken`, `--border-strong`,
  `--danger-soft`, `--accent-hover`; radii 6/8/12/pill; control height 40 px with a mouse and
  44 px on touch (`pointer: coarse`); five font sizes 12/14/16/20/30. Contrast gate: 62 pairs.
- **Components.** Block actions and the drag handle appear on hover or keyboard focus (always on
  touch); link blocks are cards with the site initial (no favicon request: privacy, CSP); the
  table sits in a frame with column-type icons, sort controls on hover, numbers' labels flush
  right, a ghost "Yeni satır" row inside the frame and a separate icon for table actions; drawn
  checkboxes; selects with a chevron; column types grouped with `<optgroup>`; status badges with
  a dot; row history as a timeline; the dialog primary action sits 16 px under the last field (Fitts ≤ 24 px).
- **Behaviour fixes found during the pass.** Menus open upwards only when they fit above inside
  their clipping box (`components/menuPlacement.ts`); the home screen stays reachable ("Ana
  sayfa", phone logo) because the last page is reopened only at app start; a table cell edit no
  longer pulls focus back over a cell the user pressed in the meantime.
- **Copy.** One term per concept (link · mail taslağı · e-posta adresi · çöp kutusuna at · boş
  hücre), the "stored on this device, no account" line appears once, buttons are verbs, a
  one-line description under each block type.
