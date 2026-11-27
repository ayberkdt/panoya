import type { BlockRegistry } from '@panoya/blocks';
import { checkUrl } from '@panoya/blocks';
import type { Block, Folder, Notebook, Page } from '@panoya/domain';
import type { SearchDoc } from './searchIndex';

/**
 * Builds search documents from canonical records. Only active records whose ancestors are all
 * active are indexed (trash is excluded by default, spec 09). Never indexes binary data or secrets.
 */
export interface WorkspaceRecords {
  folders: Folder[];
  notebooks: Notebook[];
  pages: Page[];
}

export function folderPath(
  folderId: string | null,
  folders: ReadonlyMap<string, Folder>,
): string[] | null {
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor = folderId;
  while (cursor !== null) {
    const f = folders.get(cursor);
    if (!f || f.trashed === 1 || seen.has(cursor)) return null;
    seen.add(cursor);
    names.unshift(f.name);
    cursor = f.parentFolderId;
  }
  return names;
}

export function containerDocs(records: WorkspaceRecords): {
  docs: SearchDoc[];
  pagePaths: Map<string, string[]>;
} {
  const folders = new Map(records.folders.map((f) => [f.id, f]));
  const notebooks = new Map(records.notebooks.map((n) => [n.id, n]));
  const docs: SearchDoc[] = [];
  const pagePaths = new Map<string, string[]>();
  for (const f of records.folders) {
    const path = folderPath(f.id, folders);
    if (!path) continue;
    docs.push(base(f.id, 'folder', null, f.name, path.slice(0, -1), f.updatedAt, f.localRevision));
  }
  for (const n of records.notebooks) {
    if (n.trashed === 1) continue;
    const path = folderPath(n.folderId, folders);
    if (!path) continue;
    docs.push(base(n.id, 'notebook', null, n.title, path, n.updatedAt, n.localRevision));
  }
  for (const p of records.pages) {
    if (p.trashed === 1) continue;
    const nb = notebooks.get(p.notebookId);
    if (!nb || nb.trashed === 1) continue;
    const path = folderPath(nb.folderId, folders);
    if (!path) continue;
    const pagePath = [...path, nb.title];
    pagePaths.set(p.id, [...pagePath, p.title]);
    docs.push(base(p.id, 'page', p.id, p.title, pagePath, p.updatedAt, p.localRevision));
  }
  return { docs, pagePaths };
}

function base(
  id: string,
  kind: SearchDoc['kind'],
  pageId: string | null,
  title: string,
  path: string[],
  updatedAt: string,
  revision: number,
): SearchDoc {
  return { id, kind, pageId, type: kind, title, fields: {}, tags: [], path, updatedAt, revision };
}

/** Block → doc. Field mapping by type; unknown types fall back to the registry's plain text. */
export function blockDoc(
  block: Block,
  registry: BlockRegistry,
  pagePath: string[],
): SearchDoc | null {
  if (block.trashed === 1) return null;
  const resolved = registry.resolve(block);
  const doc: SearchDoc = {
    id: block.id,
    kind: 'block',
    pageId: block.pageId,
    type: block.type,
    title: '',
    fields: {},
    tags: [],
    path: pagePath,
    updatedAt: block.updatedAt,
    revision: block.localRevision,
  };
  if (resolved.status === 'ok') {
    const p = resolved.payload as Record<string, unknown>;
    switch (block.type) {
      case 'link': {
        const url = String(p.url ?? '');
        const check = checkUrl(url);
        doc.title = String(p.title ?? '') || (check.ok ? check.host : '');
        doc.fields.url = check.ok ? `${check.host} ${url}` : url;
        doc.fields.content = [p.description, p.category].filter(Boolean).join('\n');
        doc.tags = Array.isArray(p.tags) ? p.tags.map(String) : [];
        if (p.category) doc.tags.push(String(p.category));
        break;
      }
      case 'mailDraft':
        doc.title = String(p.title ?? '');
        doc.fields.subject = String(p.subject ?? '');
        doc.fields.content = registry.plainText(block);
        break;
      case 'heading':
        doc.title = String(p.text ?? '');
        break;
      case 'quickCopy':
        doc.title = String(p.title ?? '');
        doc.fields.content = String(p.text ?? '');
        break;
      default:
        doc.fields.content = registry.plainText(block);
    }
  } else {
    doc.fields.content = registry.plainText(block);
  }
  const hasText = doc.title || Object.values(doc.fields).some(Boolean) || doc.tags.length > 0;
  return hasText ? doc : null;
}
