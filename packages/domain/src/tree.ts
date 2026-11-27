import type { Folder, Notebook, Page } from './entities';
import { sortByRank } from './rank';

export type TreeNode =
  | { kind: 'folder'; entity: Folder; children: TreeNode[] }
  | { kind: 'notebook'; entity: Notebook; children: TreeNode[] }
  | { kind: 'page'; entity: Page; children: [] };

/**
 * Builds the visible navigation tree from active records. Children of a trashed or missing parent
 * are hidden (never re-parented to the root). Inside a folder, sub-folders come before notebooks.
 */
export function buildTree(folders: Folder[], notebooks: Notebook[], pages: Page[]): TreeNode[] {
  const activeFolders = folders.filter((f) => f.trashed === 0);
  const foldersByParent = groupBy(activeFolders, (f) => f.parentFolderId);
  const notebooksByFolder = groupBy(
    notebooks.filter((n) => n.trashed === 0),
    (n) => n.folderId,
  );
  const pagesByNotebook = groupBy(
    pages.filter((p) => p.trashed === 0),
    (p) => p.notebookId,
  );

  const notebookNode = (n: Notebook): TreeNode => ({
    kind: 'notebook',
    entity: n,
    children: sortByRank(pagesByNotebook.get(n.id) ?? []).map((p) => ({
      kind: 'page',
      entity: p,
      children: [],
    })),
  });

  const visiting = new Set<string>();
  const folderNode = (f: Folder): TreeNode => {
    visiting.add(f.id);
    const subFolders = sortByRank(foldersByParent.get(f.id) ?? []).filter(
      (c) => !visiting.has(c.id),
    );
    const node: TreeNode = {
      kind: 'folder',
      entity: f,
      children: [
        ...subFolders.map(folderNode),
        ...sortByRank(notebooksByFolder.get(f.id) ?? []).map(notebookNode),
      ],
    };
    visiting.delete(f.id);
    return node;
  };

  const rootFolders = sortByRank(foldersByParent.get(null) ?? []);
  const rootNotebooks = sortByRank(notebooksByFolder.get(null) ?? []);
  // Notebooks are only reached through their (active) folder, so those under a trashed or
  // missing folder stay hidden together with their pages.
  return [...rootFolders.map(folderNode), ...rootNotebooks.map(notebookNode)];
}

export interface PathItem {
  kind: 'folder' | 'notebook' | 'page';
  id: string;
  name: string;
}

/** Breadcrumb from the root to `pageId`; empty when any ancestor is missing or trashed. */
export function pathToPage(
  pageId: string,
  folders: ReadonlyMap<string, Folder>,
  notebooks: ReadonlyMap<string, Notebook>,
  pages: ReadonlyMap<string, Page>,
): PathItem[] {
  const page = pages.get(pageId);
  if (!page || page.trashed === 1) return [];
  const notebook = notebooks.get(page.notebookId);
  if (!notebook || notebook.trashed === 1) return [];
  const items: PathItem[] = [
    { kind: 'page', id: page.id, name: page.title },
    { kind: 'notebook', id: notebook.id, name: notebook.title },
  ];
  let folderId = notebook.folderId;
  const seen = new Set<string>();
  while (folderId !== null) {
    const folder = folders.get(folderId);
    if (!folder || folder.trashed === 1 || seen.has(folderId)) return [];
    seen.add(folderId);
    items.push({ kind: 'folder', id: folder.id, name: folder.name });
    folderId = folder.parentFolderId;
  }
  return items.reverse();
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
