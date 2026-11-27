# 07 — Application shell, navigation and visual design

## Layout
Desktop ≥1024 px: resizable left sidebar (default 260px), central page content (max reading width 900px; full width toggle for table/dashboard), optional right inspector. Header breadcrumb, page title, favorite, sync/save indicator, overflow. Mobile ≤767px: drawer navigation, one content column, bottom quick-add/capture affordance, sticky compact header; tablet adaptable. No fixed width forcing whole-page horizontal scroll; table own horizontal viewport. Light/dark/system themes via CSS tokens. No emoji-only controls; accessible labels and icons.

## Navigation model
Workspace → nested folders → notebooks → pages → blocks. Notebook can have pages and folder root can contain notebooks; folders cannot be inside notebook. Sidebar tree keyboard arrows, expand/collapse, rename inline, context menu, create folder/notebook/page, move dialog, trash. Show recent, favorites, inbox, all notes, tags. Breadcrumb reflects real hierarchy. Persist UI expansion, tab state and last page per device (not shared entity). Deep link `/w/:workspaceId/p/:pageId` resolves after storage load; missing or trashed page recoverable. No title-based URLs as identity.

## Interaction patterns
- Empty states explain next action, e.g. create first folder or add link; demo data opt-in.
- `/` menu opens in empty block/editor context; categories Text, Productivity, Data, Scientific; filter synonyms TR/EN, keyboard select; Esc closes.
- Ctrl/Cmd+K command palette; action and search results separate; mobile search icon.
- Reading mode block menu has copy; editing toolbar does not cover text; 44×44 CSS px mobile touch target design goal. Focus rings, keyboard traversal, aria-live save feedback, no hover-only action.
- Desktop tabs and split view P1; independent scroll positions and focused editor, same underlying repo; mobile one panel. Unsaved changes stay recoverable during tab switch.
- i18n dictionary, pluralization and Intl formatters; `tr-TR`, `en-US`, default Turkish, timezone configurable (initial device). Internal identifiers not translated. Theme chart palette contrast and reduced motion.

## Visual state checklist
Loading skeleton only while real load; offline banner not modal; saving/saved/error distinct; no-result and broken-reference states; deleted item warning; conflict drawer; empty chart with explanation; disabled command with reason; destructive actions confirm with item count. On mobile use bottom sheet rather than tiny floating menu; keep viewport safe areas. All UI controls have functional behavior and E2E assertions.
