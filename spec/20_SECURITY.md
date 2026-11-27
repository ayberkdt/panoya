# 20 — Security, privacy and failure policy

## Threat model
Sensitive personal notes, private links with tokens, mail drafts, financial balances, attachments, auth sessions. Threats: XSS/paste/import, malicious URLs, unsafe formula execution, cross-account access, corrupted backup, browser eviction, sync replay/conflict, dependency compromise, resource exhaustion, analytics leakage. Local-first is not end-to-end encryption; browser/device user and malicious same-origin script may access local data. Cloud provider/server can access plaintext in this design. Communicate clearly.

| Threat | Required controls |
|---|---|
| XSS | schema validation, sanitizer, no raw HTML, safe URLs, React escaping, CSP, no unsafe tooltip callbacks |
| Formula abuse | restricted AST, typed allowlist, worker limits, no eval/Function/property access |
| SSRF | no auto link fetching; FX adapter allowlisted endpoints; future preview proxy denies private IPs/redirect abuse |
| Cross-account | RLS + RPC checks + private bucket + composite workspace FKs + account-scoped local stores |
| Replay/conflict | op ID/hash, expected versions, atomic command, explicit conflicts |
| Import | strict schemas, size limits, zip path validation, checksum, staging, no executable formats |
| Secrets | public config only in client; no service role; env ignored; secret scanning |
| Privacy | no notes/amounts/URLs in logs, no external analytics by default, no third-party fonts/scripts by default |
| Resource limits | bounds for block, dataset, attachment, tree depth, formula, worker and import; user-visible error |

## Implementation
Set CSP via hosting headers; start self-hosted scripts/styles and restricted connect-src (only configured API), object-src none, base-uri self/none, frame-ancestors none, form-action as needed; test actual browser behavior (KaTeX/chart inline styles may require narrowly justified style policy, never relax scripts blindly). X-Content-Type-Options nosniff, strict referrer policy, permissions policy as appropriate. HTTPS. Validate user IDs from authenticated session not request body. Never store auth tokens in exports, telemetry, crash reports. Use sanitized errors with correlation IDs; debug log redaction. Prevent account switch showing previous content while load. No secret-like tokens in demo. Explicit user action for clipboard, outbound links, export, cloud attachment, data deletion.

## Data lifecycle
User can export, delete local workspace, delete synced workspace with explicit confirmation and pending sync semantics; account deletion requires separate verified server flow, do not claim complete provider erasure without evidence. Document trash, retention and backup exclusions. Optional app lock not cryptographic protection; defer encryption until reviewed threat/key model. No collection of bank credentials. Never send notes to AI services by default. Maintain dependency audit, license inventory, vulnerability triage, update tests, no blanket suppression.

## Release security gates
Adversarial XSS tests (script, SVG, event attrs, malformed URLs), formula escape and timeout tests, ZIP traversal/bomb checks, RLS negative tests with A/B/anon, replay/idempotency, offline logout/namespace isolation, attachment private access, CSP verification, secret scan. Record any unverified hosted controls as blockers for cloud release; local-only release may proceed if local gates pass. Security assertions require evidence, not just architecture description.
