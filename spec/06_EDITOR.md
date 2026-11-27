# 06 — Rich text, Markdown and scientific editing

## Behavior
Colab-inspired vertical blocks, read/ edit modes without mandatory toggling for ordinary text. Top toolbar appears when relevant, not permanently cluttered. Tiptap starter schema: paragraph, heading 1–4, bullet/ordered list, blockquote, inline code, bold/italic/strike, link, hard break. Underline optional. Store Tiptap JSON inside richText payload only. Disable arbitrary HTML nodes. Schema validation with unknown extension preservation/recovery; never load unsupported schema and silently save truncated result. Use sanitization when pasting HTML and export HTML; plain-text paste action. Rich text keyboard navigation, undo/redo, selection toolbar. Markdown source block separate, preview rendered safely; support CommonMark and selected GFM extensions, code fence, math, task list. Raw HTML disabled by default.

## Mathematics and code
KaTeX inline/display with trust disabled; source visible/editable; parse error shown beside source, no crash. Do not interpret math display as executable formula; separate computation block. Syntax highlight code lazy loaded, copy raw source preserving indentation/newlines. No run button unless future sandbox runtime exists. Support Turkish Unicode, emoji, UTF-8, RTL-aware text direction fallback, input method composition (no slash trigger during composition). Link click in reading mode opens safe URL; editing mode open via modifier or explicit button; keyboard equivalent.

## Editing implementation
Use block-level rich editor lifecycle: mount focused blocks, static render inactive, preserve selection on non-destructive parent updates. Do not recreate editor each keystroke; memoize stable handlers and apply external version only when safe. On paste multi-block content choose a deterministic conversion preserving paragraphs; unsupported parts reported. Keyboard shortcuts documented; do not hijack browser or OS shortcuts unexpectedly. Mobile virtual keyboard viewport handling per 15.

## Acceptance
Paste bold/list/link from browser; reload preserves; paste script or event handler never executes. Turkish IME and multiline mail unaffected. Markdown preview and exports roundtrip supported subset; unsupported syntax retained as source. Undo text and structural actions correctly. Math malformed input recovers. 200-block page opens with no focus loss, chart interactions don't steal editor selection.
