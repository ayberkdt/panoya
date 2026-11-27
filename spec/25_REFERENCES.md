# 25 — Technical reference register

Selected implementation references checked via web search 2026-11-27. Use official docs and confirm exact APIs/versions at implementation. These are not evidence that the proposed application is implemented or that hosting is free. Sources support technical choices; the remaining design is a proposal.

| Topic | Official source | Implication |
|---|---|---|
| Tiptap JSON and editor model | https://tiptap.dev/docs/editor/core-concepts/introduction | rich text JSON representation |
| Tiptap React node views | https://tiptap.dev/docs/editor/extensions/custom-extensions/node-views/react | custom UI where needed |
| Tiptap schema | https://tiptap.dev/docs/editor/core-concepts/schema | validate schema and preserve unknown data separately |
| Clipboard text | https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText | secure context, handle rejected write |
| Clipboard rich | https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/write | feature-detect formats and fallback |
| Web Share | https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API | optional platform-dependent share |
| Dexie docs | https://dexie.org/docs/index | IndexedDB transactions and versions |
| Dexie transaction | https://dexie.org/docs/Transaction/Transaction | atomic local commands |
| Browser quota/eviction | https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria | local persistence not permanent guarantee |
| PWA cache | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching | cache shell, manage versions |
| Supabase RLS | https://supabase.com/docs/guides/database/postgres/row-level-security | ownership controls and negative tests |
| Supabase Storage access | https://supabase.com/docs/guides/storage/security/access-control | private attachment policies |
| math.js security | https://mathjs.org/docs/expressions/security.html | do not trust arbitrary evaluation; restricted AST |
| ECharts accessibility | https://echarts.apache.org/handbook/en/best-practices/aria/ | accessibility option plus data alternatives |
| ECB reference rates | https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html | dated reference rates, not live trading prices |
| ECB methodology | https://data.ecb.europa.eu/methodology/exchange-rates | rate semantics |

Additional implementation checks: official Vite, React, TypeScript, Decimal.js, KaTeX, Vitest, Playwright, Cloudflare Pages docs; verify license, stable API, browser support and cost before selecting versions. No fixed provider pricing or unverified package versions in this spec. Use standards-aligned CSV, ISO 4217 currency codes, WCAG 2.2 AA as accessibility target (verify exact requirements during audit).
