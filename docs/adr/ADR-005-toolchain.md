# ADR-005 — Toolchain and dependency choices

Status: accepted (2026-11-27). Versions read from the npm registry on that date.

| Choice                                | Version                | Why                                                                                                                                                                                              |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm workspace via corepack           | 12.23.0                | spec 00; no global install needed                                                                                                                                                                |
| TypeScript                            | **6.0.3** (not 7.0.2)  | `typescript-eslint` 8.74.0 peer range is `<6.1.0`                                                                                                                                                |
| React / React DOM                     | 19.3.1                 |                                                                                                                                                                                                  |
| Vite + @vitejs/plugin-react           | 8.4.0 / 6.3.0          |                                                                                                                                                                                                  |
| Zod                                   | 4.6.7                  | runtime validation at every boundary                                                                                                                                                             |
| Dexie                                 | 4.4.7                  | IndexedDB transactions                                                                                                                                                                           |
| Tiptap (core, react, pm, starter-kit) | 3.35.0                 | rich-text block only (ADR-001)                                                                                                                                                                   |
| fractional-indexing                   | 4.0.0                  | ADR-002                                                                                                                                                                                          |
| lucide-react                          | 1.82.0                 | icons with accessible labels on the buttons                                                                                                                                                      |
| Vitest / jsdom / fake-indexeddb       | 5.1.2 / 31.0.1 / 6.2.8 | unit + integration                                                                                                                                                                               |
| Playwright                            | 1.65.1                 | E2E; runs on installed **Microsoft Edge** (`channel: msedge`) because the cached Chromium build (1234) does not match this Playwright release (expects 1255) and downloading ~170 MB was avoided |

Deliberately not added: Tailwind (plain CSS tokens are enough and keep the budget visible),
a router library (tiny history router, ids only), state libraries (store subscriptions).

Deferred to their gates: Decimal.js (G5 finance), ECharts (G4), KaTeX + Markdown renderer (spec 06
math/markdown), MiniSearch (G3), vite-plugin-pwa (G5), Supabase (G6).

License check (`npm view <pkg> license`, 2026-11-27): react, react-dom, zod, @tiptap/* — MIT;
dexie — Apache-2.0; fractional-indexing — CC0-1.0; lucide-react — ISC. Transitive dependencies
are not yet inventoried (G8 task).
