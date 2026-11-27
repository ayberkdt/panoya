# 22 — Hosting, configuration and release

## Local development
Provide exact prerequisites and scripts, `.env.example` with public placeholders only, local-only mode default with no Supabase keys. Build produces static `dist/`; no paid infrastructure needed. Select compatible Node/pnpm versions and record. Configure Vite base path and SPA fallback. `pnpm dev` uses localhost; for device testing use secure tunnel or HTTPS dev configuration with user permission, not public exposure by default. Seed demo via explicit command or UI action; no real notes.

## Hosting
Candidate Cloudflare Pages or equivalent static service. Verify current plan, build/runtime limits and any costs at deployment; no claim always free. Production HTTPS, correct CSP headers, route fallback, cache immutable hashed assets, HTML/service worker update strategy. Optional FX endpoint public rates only with cache, request limits and allowed upstream; no user notes. Optional Supabase project: region choice and privacy, Auth redirect allowlist, local migrations reviewed and tested, private bucket policies, restricted keys. Never run production migration/deploy automatically. Document setup instructions and recovery plan.

## CI
GitHub Actions or repo CI: deterministic install lock, test/type/lint/build, security checks, artifact optional. No secret in logs; restrict permissions, pin trusted actions as appropriate. Avoid unbounded workflows/cost; manual release and hosted integration job opt-in. If no remote repo do not create/push without request. Changelog semantic version, data schema version independent; migration tested from previous release, rollback policy (older app may not read newer schema; do not recommend downgrade without backup).

## Operational states
Show app version, local schema, storage estimate, last successful backup date, optional sync pending/conflict counts, FX effective date and provider. Diagnostics export metadata only (no note contents or balances by default). Rate-limit errors preserve local data. Backup before destructive action, documented restore procedure. Hosted monitoring only opt-in and privacy-preserving. Release checklist: all applicable gates passed, mobile manual checks, backup restore, accessibility, CSP, config/secret scan, offline update, no fake buttons. Local-only release allowed with cloud feature disabled and clear status; cloud release requires live authorization/persistence checks. Deployment cost, account/credentials and actual physical device testing remain user-dependent.
