# 19 — Templates and extension architecture

## Templates
Templates are declarative immutable snapshots of block definitions with placeholders, not executable scripts. Built-in course links, lecture notes, mail draft, research log, reading list, budget, statistical analysis and weekly plan. Instantiate with fresh IDs, remap internal references and datasets, copy selected attachments or explicit references, prompt required placeholders. User templates created from page with opt-in exclude sensitive values (default exclude draft addresses and actual financial amounts), preview before saving. Versioned template schema, safe validation, unknown block preserved. Updating a template never mutates existing pages silently.

## Extension contract
First-party compile-time registered block definitions per 05. Metadata manifest `{id,version,blockTypes,capabilities,minAppVersion}`; namespaced IDs, payload migrations, output schema, read/edit view, serializer, tests. Capability model defaults none: storage via scoped repository, no auth access, no raw DB, network off unless approved adapter. Do not expose user-provided JavaScript execution in MVP. User custom blocks P1 via declarative fields, output mappings, chart config and safe formula AST; template variables typed and scoped. Import/export extension data validated, no remote scripts. Unknown extension can still export payload. Feature flags and clear diagnostics.

## Deferred third-party plugins
Separate threat model and sandbox design before any execution (isolated origin/worker/iframe, explicit capability grants, CSP, resource limits, revocation, review and signatures as needed); worker alone is not sufficient isolation for untrusted network-capable code. No promise of plugin marketplace. Python/Jupyter-style execution separate product decision with sandbox, dependencies, compute limits and reproducibility; code blocks remain non-executable. External calendar/mail/Drive connectors opt-in later; no automatic sending or third-party note transmission.

## Tests
Template duplicate produces new IDs and references, missing placeholders visible, actual personal values excluded by default, unsupported block payload preserved, custom formula cannot escape AST, permission denied for unknown capability, extension removal doesn't delete stored content. Document API stability and migration policy before public extension release.
