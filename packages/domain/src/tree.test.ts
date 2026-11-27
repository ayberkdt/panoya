import { describe, expect, it } from 'vitest';
import type { Folder, Notebook, Page } from './entities';
import { buildTree, pathToPage } from './tree';

const base = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  trashed: 0 as const,
  deleteBatchId: null,
  schemaVersion: 1 as const,
  localRevision: 1,
  remoteVersion: null,
};
const folder = (id: string, parent: string | null, rank: string, trashed = false): Folder => ({
  ...base,
  ...(trashed ? { trashed: 1 as const, deletedAt: base.createdAt, deleteBatchId: id } : {}),
  id,
  kind: 'folder',
  parentFolderId: parent,
  name: id,
  rank,
});
const notebook = (id: string, folderId: string | null, rank: string): Notebook => ({
  ...base,
  id,
  kind: 'notebook',
  folderId,
  title: id,
  icon: null,
  rank,
});
const page = (id: string, notebookId: string, rank: string): Page => ({
  ...base,
  id,
  kind: 'page',
  notebookId,
  title: id,
  rank,
  archivedAt: null,
  templateId: null,
});

describe('buildTree', () => {
  it('nests folders before notebooks, orders by rank and hides trashed subtrees', () => {
    const tree = buildTree(
      [folder('uni', null, 'a1'), folder('sub', 'uni', 'a0'), folder('gone', null, 'a2', true)],
      [
        notebook('links', 'uni', 'a0'),
        notebook('rootnb', null, 'a0'),
        notebook('orphan', 'gone', 'a0'),
      ],
      [page('p2', 'links', 'a1'), page('p1', 'links', 'a0'), page('hidden', 'orphan', 'a0')],
    );
    expect(tree.map((n) => n.entity.id)).toEqual(['uni', 'rootnb']);
    const uni = tree[0]!;
    expect(uni.children.map((n) => n.entity.id)).toEqual(['sub', 'links']);
    expect(uni.children[1]!.children.map((n) => n.entity.id)).toEqual(['p1', 'p2']);
  });

  it('builds a breadcrumb and returns empty for hidden pages', () => {
    const folders = new Map([['uni', folder('uni', null, 'a0')]]);
    const notebooks = new Map([['links', notebook('links', 'uni', 'a0')]]);
    const pages = new Map([['p', page('p', 'links', 'a0')]]);
    expect(pathToPage('p', folders, notebooks, pages).map((i) => i.id)).toEqual([
      'uni',
      'links',
      'p',
    ]);
    folders.set('uni', folder('uni', null, 'a0', true));
    expect(pathToPage('p', folders, notebooks, pages)).toEqual([]);
  });
});
