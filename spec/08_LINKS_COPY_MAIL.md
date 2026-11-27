# 08 — Link library, clipboard and mail drafts

## Link block
Fields title (required or fallback domain), URL, description, course/category, tags, optional createdAt/lastOpenedAt (local, opt-in). Use URL parser; allow http/https and optionally mailto via explicit type. Reject javascript:, data:, file:, credentials embedded in URLs; show destination domain and distinguish external links. Open with noopener/noreferrer; no silent tracking. Full URL retained including query and fragment (some attendance links require tokens); avoid exposing in telemetry, notifications or previews. Never automatically visit links or send URL to external preview service. Optional server metadata fetch deferred: SSRF protection, user consent and private-network denial necessary. Paste URL suggests title from domain; user can group via headings or link collections, table/list view, quick copy URL. Search by title, URL/domain, tags and description. Reading mode one-tap open, separate copy button; editing mode no accidental navigation.

## Clipboard service
```ts
interface CopyRequest { plain: string; html?: string; format: 'plain'|'rich'|'markdown'|'csv'|'json'|'latex'; }
```
Use navigator.clipboard.writeText directly in user gesture; for supported rich copy use ClipboardItem with text/plain fallback and sanitized HTML. No clipboard reading without explicit action. If denied/unavailable, offer selectable textarea and OS copy; never falsely show success. Preserve line breaks, indentation, accents; no decorative labels unless requested. Use `aria-live` confirmation, accessible button always visible on mobile. Copy full page in block rank order with meaningful separators; code copies raw, formulas copy source or result separately, link copies URL or Markdown, tables TSV or CSV, charts offer PNG only if actual supported export. Optionally use navigator.share after feature check and direct gesture; fallback copy. Clipboard operations do not transmit content.

## Draft block
Payload: title, to/cc/bcc arrays (raw names/emails supported with warning), subject, bodyText or rich body JSON (one canonical field via discriminated union), language, lastEditedAt. Copy body default, separate subject/to, copy all with clear headers, rich copy optional, template duplicate. Plain text serialization must preserve blank lines and signature. Optional `mailto` opens local client only on explicit action; percent encode components, handle size limits, no claim of sent mail. No auto-send, SMTP, Gmail credentials or AI API. Show empty recipient allowed. Draft templates for teacher, request, reminder, meeting, academic inquiry with editable placeholders (not real emails); unresolved placeholders highlighted before copying but user may proceed.

## Acceptance
Create course link with query+fragment, reopen exact URL; reject XSS link; paste and copy link; clipboard actual OS on iPhone Safari, Android Chrome and desktop; check multiline draft matches fixture byte-for-byte aside from OS line ending normalization; denied permission fallback; copy while offline; copy subject never includes body; no unsolicited network traffic on link creation. Test data contains example.invalid only.
