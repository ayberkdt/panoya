# 02 — Architecture and technology

## Stack decision
React + TypeScript + Vite, Tailwind or equivalent token CSS, Tiptap/ProseMirror within rich-text block, Dexie/IndexedDB, Zod runtime schemas, Decimal.js for money, restricted custom expression AST (math.js pure functions optional), KaTeX, Apache ECharts, Web Workers, Vitest + Playwright. PWA service worker via maintained Vite integration or explicit worker. Optional Supabase Auth/Postgres/Storage. Cloudflare Pages or equivalent static hosting; optional server-side function for public FX fetch. Choose mutually compatible stable versions at implementation, verify licenses and pin lockfile. No service role key in browser.

## Repo layout (adapt existing repo via ADR)
```text
apps/web/src/{app,routes,components,features,i18n,workers}
packages/domain/src/{entities,commands,schemas,errors,ids}
packages/storage/src/{repositories,dexie,migrations,backup}
packages/blocks/src/{registry,definitions,serializers}
packages/compute/src/{ast,types,graph,evaluator,units}
packages/analytics/src/{descriptive,regression,charts}
packages/finance/src/{money,fx,portfolio}
packages/sync/src/{protocol,client,adapters,conflicts}
supabase/{migrations,functions,tests}
fixtures/ tests/e2e/ docs/adr/ spec/
```
Avoid needless packages if repo is small: equivalent module boundaries inside single app acceptable. Domain/compute/analytics depend on no DOM, storage, React or network. UI orchestrates commands; storage adapters persist; workers operate on immutable snapshots; sync transport independent of UI. No circular imports. Data flow: UI intent → validated command → local atomic transaction (entity + outbox + history) → repository notification → derived graph/index → UI. Derived caches disposable, rebuildable, keyed by input revision and evaluator version. External fetch only through typed adapters, abortable and validated.

## Canonical representation ADR-001
Blocks are independent records ordered within page. RichText block payload is Tiptap JSON; Markdown block source is a string. Do not store whole-page Tiptap JSON plus block rows; duplicate canonical storage causes inconsistencies. Each rich text editor mounts for focused/visible blocks only; separate read renderer. Top-level structured blocks rendered as React components; Tiptap node views only for inline rich text extensions if necessary. Global undo for committed commands; editor-local undo for uncommitted typing, reconcile at command boundaries.

## Interfaces
```ts
interface WorkspaceRepository {
  getPage(id: string): Promise<Page | undefined>;
  getBlocks(pageId: string): Promise<Block[]>;
  execute(command: DomainCommand): Promise<CommandResult>;
  subscribe(listener: (change: ChangeSet) => void): () => void;
}
interface FxProvider { getRates(request: RateRequest, signal?: AbortSignal): Promise<RateSnapshot>; }
interface SyncTransport { push(batch: PushBatch): Promise<PushResult>; pull(cursor: string | null): Promise<PullResult>; }
```
Interfaces illustrative; actual schema types must be shared and runtime-validated. `Result` or typed exception includes code, safe message and retryability. No direct DB access from view. Exports immutable snapshot under transaction. Document ADRs: canonical blocks, ordering, sync protocol, FX rate strategy, expression security, storage/backup, provider selection.
