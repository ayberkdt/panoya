# 05 — Block registry and command system

## Contract
```ts
interface BlockDefinition<P> {
 type: string; currentVersion: number;
 validate(raw: unknown): P;
 createDefault(): P;
 migrate(raw: unknown, fromVersion: number): P;
 toPlainText(payload: P): string;
 toMarkdown(payload: P): string;
 references(payload: P): ValueRef[];
 // UI renderer and output schema are registered by separate adapters
}
```
Add definition, migration, serializers, read/edit component, output descriptor, slash metadata and tests without changing core switch statements. Unknown versions preserved read-only. Block outputs immutable and typed; no side effects in compute. Registry IDs stable and namespaced. UI error boundaries per block avoid crashing notebook. Each block independent collapse, duplicate, copy, move, delete, drag, keyboard alternative. Use semantic drag handle and accessible Move up/down or Move to dialog. Avoid nested editable DOM conflicts.

## Initial block catalog
| Type | Payload core | Output |
|---|---|---|
| richText | Tiptap JSON | plainText |
| markdown | source, previewMode | source |
| heading / divider | text, level / style | none |
| link | title,url,description,tags | url |
| quickCopy | title, text, format | text |
| mailDraft | to,cc,bcc,subject,body,format | subject,body |
| checklist | items with id, text, checked | checkedCount,totalCount |
| code | language, source | source (no execution) |
| formula | expression, bindings, outputType | result |
| numberInput | label,value,unit | value |
| table | datasetId, visibleColumns, sort/filter view | datasetRef |
| statistics | datasetId,columnIds,method,options | typed statistics |
| chart | sourceRefs,encoding,chartType | none (presentation) |
| currency | amount,from,to,rateMode,rateRef | converted |
| portfolio | datasetId,base,rateMode | total,net,breakdown |
| file / image | attachmentId,caption,alt | attachmentRef |
| dateEvent | date/time,timezone,label | date |
| reference | bibliographic fields, DOI | citation |
| pageReference | targetPageId,label | pageId |

Rich text supports paragraphs, headings, lists, code inline, marks, links; top-level heading block optional. Data tables and text tables distinct (do not implicitly calculate from formatted cells). Payloads may reference datasets/attachments but do not duplicate them. All block types have safe text fallback. Add specialized blocks only after their gate; hide slash commands for unimplemented blocks.

## Operations and tests
Insert at cursor/between blocks; Enter from quickCopy editor stays in content; keyboard command for new block; delete confirm if dependents; duplicate outputs fresh IDs; move cross page same workspace atomically; slash menu searchable; clipboard serialization independent of visible DOM. Test focus restoration, block ID stability, drag fallback, unknown version, migrate and roundtrip, all registry types have valid defaults and serializers, no accidental duplicate writes during React remount.
