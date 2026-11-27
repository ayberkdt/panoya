import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainCommand } from './commands';
import type { PlannerEnv } from './context';
import { fixedClock, sequentialIds } from './env';
import type { Block, Folder, Notebook, Page } from './entities';
import { DomainError } from './errors';
import { planCommand } from './planner';
import { sortByRank } from './rank';
import { InMemoryContext, permissiveCatalog } from './testing';

const WS = '11111111-1111-4111-8111-111111111111';
const OTHER_WS = '22222222-2222-4222-8222-222222222222';

let ctx: InMemoryContext;
let env: PlannerEnv;

async function run(command: DomainCommand) {
  const mutation = await planCommand(command, ctx, env);
  ctx.apply(mutation);
  return mutation;
}
const idOf = async (command: DomainCommand) => (await run(command)).primary!.id;

async function expectError(command: DomainCommand, code: DomainError['code'], key?: string) {
  const error = await planCommand(command, ctx, env).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
  if (key) expect((error as DomainError).messageKey).toBe(key);
}

beforeEach(() => {
  ctx = new InMemoryContext(new Set([WS, OTHER_WS]));
  env = {
    clock: fixedClock('2026-01-02T10:00:00.000Z'),
    ids: sequentialIds(),
    blocks: permissiveCatalog(['text']),
  };
});

describe('create and hierarchy', () => {
  it('creates University > Linkler > page with initial blocks in one mutation', async () => {
    const folder = await idOf({
      type: 'createFolder',
      workspaceId: WS,
      parentFolderId: null,
      name: 'Üniversite',
    });
    const notebook = await idOf({
      type: 'createNotebook',
      workspaceId: WS,
      folderId: folder,
      title: 'Linkler',
    });
    const m = await run({
      type: 'createPage',
      workspaceId: WS,
      notebookId: notebook,
      title: 'Satellite Systems',
      blocks: [{ type: 'text', payload: { text: 'a' } }, { type: 'text' }],
    });
    expect(m.changes.map((c) => c.kind)).toEqual(['page', 'block', 'block']);
    const blocks = sortByRank(
      [...ctx.records.values()].filter((e): e is Block => e.kind === 'block'),
    );
    expect(blocks.map((b) => b.payload)).toEqual([{ text: 'a' }, { text: '' }]);
    expect(m.undoable).toBe(true);
  });

  it('rejects unknown parent, cross-workspace parent and unknown workspace', async () => {
    const folder = await idOf({
      type: 'createFolder',
      workspaceId: WS,
      parentFolderId: null,
      name: 'A',
    });
    await expectError(
      { type: 'createNotebook', workspaceId: OTHER_WS, folderId: folder, title: 'x' },
      'NOT_FOUND',
      'error.folder.notFound',
    );
    await expectError(
      {
        type: 'createFolder',
        workspaceId: '33333333-3333-4333-8333-333333333333',
        parentFolderId: null,
        name: 'x',
      },
      'NOT_FOUND',
    );
  });

  it('rejects invalid input before touching storage', async () => {
    await expectError(
      { type: 'createFolder', workspaceId: WS, parentFolderId: null, name: '   ' },
      'VALIDATION',
    );
    await expectError(
      { type: 'createFolder', workspaceId: 'not-a-uuid', parentFolderId: null, name: 'x' },
      'VALIDATION',
    );
  });

  it('rejects duplicate requested ids', async () => {
    const id = '44444444-4444-4444-8444-444444444444';
    await run({ type: 'createFolder', workspaceId: WS, id, parentFolderId: null, name: 'A' });
    await expectError(
      { type: 'createFolder', workspaceId: WS, id, parentFolderId: null, name: 'B' },
      'VALIDATION',
      'error.id.duplicate',
    );
  });

  it('places items by start/end/before/after', async () => {
    const nb = await idOf({ type: 'createNotebook', workspaceId: WS, folderId: null, title: 'N' });
    const a = await idOf({ type: 'createPage', workspaceId: WS, notebookId: nb, title: 'a' });
    const c = await idOf({ type: 'createPage', workspaceId: WS, notebookId: nb, title: 'c' });
    await run({
      type: 'createPage',
      workspaceId: WS,
      notebookId: nb,
      title: 'b',
      placement: { kind: 'after', id: a },
    });
    await run({
      type: 'createPage',
      workspaceId: WS,
      notebookId: nb,
      title: '0',
      placement: { kind: 'start' },
    });
    await run({
      type: 'createPage',
      workspaceId: WS,
      notebookId: nb,
      title: 'b2',
      placement: { kind: 'before', id: c },
    });
    const titles = sortByRank(
      [...ctx.records.values()].filter((e): e is Page => e.kind === 'page'),
    ).map((p) => p.title);
    expect(titles).toEqual(['0', 'a', 'b', 'b2', 'c']);
  });

  it('rebalances siblings atomically when ranks grow long', async () => {
    const nb = await idOf({ type: 'createNotebook', workspaceId: WS, folderId: null, title: 'N' });
    const first = await idOf({
      type: 'createPage',
      workspaceId: WS,
      notebookId: nb,
      title: 'first',
    });
    await run({ type: 'createPage', workspaceId: WS, notebookId: nb, title: 'last' });
    let rebalanced = false;
    for (let i = 0; i < 200 && !rebalanced; i++) {
      const m = await run({
        type: 'createPage',
        workspaceId: WS,
        notebookId: nb,
        title: `p${i}`,
        placement: { kind: 'after', id: first },
      });
      rebalanced = m.changes.length > 1;
    }
    expect(rebalanced).toBe(true);
    const pages = sortByRank([...ctx.records.values()].filter((e): e is Page => e.kind === 'page'));
    expect(pages[0]!.title).toBe('first');
    expect(pages[1]!.title.startsWith('p')).toBe(true);
    expect(pages.at(-1)!.title).toBe('last');
    expect(Math.max(...pages.map((p) => p.rank.length))).toBeLessThanOrEqual(24);
  });
});

describe('move', () => {
  it('prevents folder cycles', async () => {
    const a = await idOf({
      type: 'createFolder',
      workspaceId: WS,
      parentFolderId: null,
      name: 'A',
    });
    const b = await idOf({ type: 'createFolder', workspaceId: WS, parentFolderId: a, name: 'B' });
    const c = await idOf({ type: 'createFolder', workspaceId: WS, parentFolderId: b, name: 'C' });
    await expectError(
      { type: 'move', workspaceId: WS, kind: 'folder', id: a, parentId: c },
      'INVARIANT',
      'error.folder.cycle',
    );
    await expectError(
      { type: 'move', workspaceId: WS, kind: 'folder', id: a, parentId: a },
      'INVARIANT',
      'error.folder.cycle',
    );
  });

  it('moves a page between notebooks keeping its id', async () => {
    const n1 = await idOf({ type: 'createNotebook', workspaceId: WS, folderId: null, title: 'N1' });
    const n2 = await idOf({ type: 'createNotebook', workspaceId: WS, folderId: null, title: 'N2' });
    const p = await idOf({ type: 'createPage', workspaceId: WS, notebookId: n1, title: 'P' });
    await run({ type: 'move', workspaceId: WS, kind: 'page', id: p, parentId: n2 });
    expect((ctx.records.get(p) as Page).notebookId).toBe(n2);
  });

  it('requires a parent for pages and blocks', async () => {
    const n1 = await idOf({ type: 'createNotebook', workspaceId: WS, folderId: null, title: 'N1' });
    const p = await idOf({ type: 'createPage', workspaceId: WS, notebookId: n1, title: 'P' });
    await expectError(
      { type: 'move', workspaceId: WS, kind: 'page', id: p, parentId: null },
      'VALIDATION',
      'error.parent.required',
    );
  });
});

describe('trash and restore', () => {
  async function tree() {
    const folder = await idOf({
      type: 'createFolder',
      workspaceId: WS,
      parentFolderId: null,
      name: 'F',
    });
    const nb = await idOf({
      type: 'createNotebook',
      workspaceId: WS,
      folderId: folder,
      title: 'N',
    });
    const p1 = await idOf({
      type: 'createPage',
      workspaceId: WS,
      notebookId: nb,
      title: 'P1',
      blocks: [{ type: 'text' }],
    });
    const p2 = await idOf({ type: 'createPage', workspaceId: WS, notebookId: nb, title: 'P2' });
    return { folder, nb, p1, p2 };
  }

  it('trashes a subtree with one batch and restores exactly that batch', async () => {
    const { folder, nb, p1, p2 } = await tree();
    const older = await run({ type: 'trash', workspaceId: WS, kind: 'page', id: p2 });
    const batch = await run({ type: 'trash', workspaceId: WS, kind: 'folder', id: folder });
    expect(batch.changes).toHaveLength(4); // folder, notebook, p1, its block (p2 already trashed)
    expect((ctx.records.get(p2) as Page).deleteBatchId).toBe(older.batchId);

    await run({ type: 'restore', workspaceId: WS, batchId: batch.batchId! });
    expect((ctx.records.get(folder) as Folder).trashed).toBe(0);
    expect((ctx.records.get(nb) as Notebook).trashed).toBe(0);
    expect((ctx.records.get(p1) as Page).trashed).toBe(0);
    // The older, separate deletion stays in the trash.
    expect((ctx.records.get(p2) as Page).trashed).toBe(1);
  });

  it('asks for a target when the original parent is gone', async () => {
    const { nb, p1 } = await tree();
    const pageBatch = await run({ type: 'trash', workspaceId: WS, kind: 'page', id: p1 });
    await run({ type: 'trash', workspaceId: WS, kind: 'notebook', id: nb });
    await expectError(
      { type: 'restore', workspaceId: WS, batchId: pageBatch.batchId! },
      'CONFLICT',
      'error.restore.parentMissing',
    );

    const target = await idOf({
      type: 'createNotebook',
      workspaceId: WS,
      folderId: null,
      title: 'Kurtarılan',
    });
    await run({
      type: 'restore',
      workspaceId: WS,
      batchId: pageBatch.batchId!,
      targetParentId: target,
    });
    const page = ctx.records.get(p1) as Page;
    expect(page.trashed).toBe(0);
    expect(page.notebookId).toBe(target);
  });

  it('purges a batch permanently including orphaned children', async () => {
    const { folder, p2 } = await tree();
    await run({ type: 'trash', workspaceId: WS, kind: 'page', id: p2 });
    const batch = await run({ type: 'trash', workspaceId: WS, kind: 'folder', id: folder });
    const purge = await run({ type: 'purge', workspaceId: WS, batchId: batch.batchId! });
    expect(purge.undoable).toBe(false);
    expect(ctx.records.size).toBe(0);
  });

  it('cannot create inside trashed parents', async () => {
    const { nb } = await tree();
    await run({ type: 'trash', workspaceId: WS, kind: 'notebook', id: nb });
    await expectError(
      { type: 'createPage', workspaceId: WS, notebookId: nb, title: 'x' },
      'INVARIANT',
      'error.parent.trashed',
    );
  });
});

describe('blocks', () => {
  async function page() {
    const nb = await idOf({ type: 'createNotebook', workspaceId: WS, folderId: null, title: 'N' });
    return idOf({ type: 'createPage', workspaceId: WS, notebookId: nb, title: 'P' });
  }

  it('updates with optimistic revision and rejects stale writes', async () => {
    const p = await page();
    const b = await idOf({ type: 'createBlock', workspaceId: WS, pageId: p, blockType: 'text' });
    await run({
      type: 'updateBlock',
      workspaceId: WS,
      id: b,
      payload: { text: 'one' },
      expectedRevision: 1,
    });
    await expectError(
      {
        type: 'updateBlock',
        workspaceId: WS,
        id: b,
        payload: { text: 'two' },
        expectedRevision: 1,
      },
      'CONFLICT',
    );
    expect((ctx.records.get(b) as Block).payload).toEqual({ text: 'one' });
  });

  it('rejects unknown block types and oversized payloads', async () => {
    const p = await page();
    await expectError(
      { type: 'createBlock', workspaceId: WS, pageId: p, blockType: 'nope' },
      'UNSUPPORTED',
    );
    await expectError(
      {
        type: 'createBlock',
        workspaceId: WS,
        pageId: p,
        blockType: 'text',
        payload: { text: 'x'.repeat(600_000) },
      },
      'LIMIT',
    );
  });

  it('duplicates a page with fresh ids and remapped internal references', async () => {
    const p = await page();
    const b1 = await idOf({
      type: 'createBlock',
      workspaceId: WS,
      pageId: p,
      blockType: 'text',
      payload: { text: 'a' },
    });
    await run({
      type: 'createBlock',
      workspaceId: WS,
      pageId: p,
      blockType: 'text',
      payload: { text: 'see', ref: b1 },
    });
    const m = await run({ type: 'duplicatePage', workspaceId: WS, id: p, title: 'P (kopya)' });
    const newPage = m.primary!.id;
    const copies = sortByRank(
      [...ctx.records.values()].filter(
        (e): e is Block => e.kind === 'block' && e.pageId === newPage,
      ),
    );
    expect(copies).toHaveLength(2);
    expect(copies.every((c) => c.id !== b1)).toBe(true);
    expect((copies[1]!.payload as { ref: string }).ref).toBe(copies[0]!.id);
  });

  it('moves a block across pages atomically', async () => {
    const p1 = await page();
    const nb = (ctx.records.get(p1) as Page).notebookId;
    const p2 = await idOf({ type: 'createPage', workspaceId: WS, notebookId: nb, title: 'P2' });
    const b = await idOf({ type: 'createBlock', workspaceId: WS, pageId: p1, blockType: 'text' });
    await run({
      type: 'move',
      workspaceId: WS,
      kind: 'block',
      id: b,
      parentId: p2,
      placement: { kind: 'start' },
    });
    expect((ctx.records.get(b) as Block).pageId).toBe(p2);
  });
});
