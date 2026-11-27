# ADR-001 — Blocks are the canonical page representation

Status: accepted (2026-11-27)

## Context

Spec 02 requires one source of truth for page content. Storing a whole-page editor document next to
block rows would create two canonical copies that drift apart.

## Decision

- A page is the rank-ordered set of its `Block` records. There is no page-level editor document.
- A `richText` block stores Tiptap/ProseMirror JSON in `payload.doc`, validated against an
  allowlist of node and mark types (`packages/blocks/src/definitions/richText.ts`). Payloads with
  unknown nodes or unsafe link marks resolve as `invalid` and are kept read-only instead of being
  truncated on save.
- Structured blocks (link, quick copy, mail draft, checklist, code, heading, divider) are plain
  JSON payloads with Zod schemas and their own React components.
- Block types the app does not know (or a newer `payloadVersion`) are preserved byte-for-byte at the
  JSON level, rendered read-only with a text fallback and still exportable.
- The Tiptap editor is mounted only while a text block is edited and is code-split into its own
  chunk (prefetched on idle); inactive blocks render through a safe JSON→React renderer.

## Consequences

- Copy/export/search work from block records via registry serializers, independent of the DOM.
- Cross-block rich selection is not available (acceptable for this product).
