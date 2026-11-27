import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '@panoya/blocks';
import { DomainError, fixedClock, sequentialIds, type Block, type Page } from '@panoya/domain';
import type { StorageBackend } from './backend';
import { DexieBackend } from './dexie';
import { MemoryBackend } from './memory';
import { WorkspaceStore, type ChangeSet } from './store';

const registry = createDefaultRegistry();

type Factory = () => Promise<StorageBackend>;
const backends: [string, Factory][] = [
  ['memory', async () => new MemoryBackend()],
  [
    'dexie (fake-indexeddb, unit-level evidence only)',
    async () => {
      const b = new DexieBackend({
        name: `test-${Math.random()}`,
        indexedDB: new IDBFactory(),
        IDBKeyRange,
        broadcast: false,
      });
      await b.open();
      return b;
    },
  ],
];

describe.each(backends)('WorkspaceStore on %s', (_name, factory) => {
  let store: WorkspaceStore;
  let ws: string;

  beforeEach(async () => {
    store = new WorkspaceStore(await factory(), registry, {
      clock: fixedClock('2026-01-02T10:00:00.000Z'),
      ids: sequentialIds(),
    });
    ws = (
      await store.ensureWorkspace({ name: 'Çalışma alanım', locale: 'tr-TR', baseCurrency: 'EUR' })
    ).id;
  });
  afterEach(() => store.close());

  const id = async (p: Promise<{ mutation: { primary?: { id: string } } }>) =>
    (await p).mutation.primary!.id;

  async function seed() {
    const folder = await id(
      store.execute({
        type: 'createFolder',
        workspaceId: ws,
        parentFolderId: null,
        name: 'Üniversite',
      }),
    );
    const notebook = await id(
      store.execute({
        type: 'createNotebook',
        workspaceId: ws,
        folderId: folder,
        title: 'Linkler',
      }),
    );
    const page = await id(
      store.execute({
        type: 'createPage',
        workspaceId: ws,
        notebookId: notebook,
        title: 'Satellite Systems',
        blocks: [
          {
            type: 'link',
            payload: {
              title: 'Yoklama',
              url: 'https://example.invalid/attendance?course=demo#form',
              description: '',
              category: 'Satellite Systems',
              tags: [],
            },
          },
        ],
      }),
    );
    return { folder, notebook, page };
  }

  it('ensureWorkspace is idempotent', async () => {
    const again = await store.ensureWorkspace({ name: 'x', locale: 'tr-TR', baseCurrency: 'EUR' });
    expect(again.id).toBe(ws);
    expect(await store.listWorkspaces()).toHaveLength(1);
  });

  it('persists the folder → notebook → page → link flow with the exact URL', async () => {
    const { page } = await seed();
    const blocks = await store.getBlocks(page);
    expect(blocks).toHaveLength(1);
    expect((blocks[0]!.payload as { url: string }).url).toBe(
      'https://example.invalid/attendance?course=demo#form',
    );
    const data = await store.workspaceData(ws);
    expect([data.folders.length, data.notebooks.length, data.pages.length]).toEqual([1, 1, 1]);
  });

  it('notifies subscribers with affected pages after commit', async () => {
    const { page } = await seed();
    const seen: ChangeSet[] = [];
    const off = store.subscribe((c) => seen.push(c));
    await store.execute({
      type: 'createBlock',
      workspaceId: ws,
      pageId: page,
      blockType: 'richText',
    });
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.pageIds.has(page)).toBe(true);
    expect(seen[0]!.kinds.has('block')).toBe(true);
  });

  it('undo/redo of a move restores the previous parent and survives later typing', async () => {
    const { notebook, page } = await seed();
    const other = await id(
      store.execute({ type: 'createNotebook', workspaceId: ws, folderId: null, title: 'Diğer' }),
    );
    await store.execute({ type: 'move', workspaceId: ws, kind: 'page', id: page, parentId: other });
    const [block] = await store.getBlocks(page);
    // Typing (non-undoable) after the move must not block undoing the move.
    await store.execute({
      type: 'updateBlock',
      workspaceId: ws,
      id: block!.id,
      expectedRevision: block!.localRevision,
      payload: { ...(block!.payload as object), description: 'not' },
    });

    await store.undo(ws);
    expect((await store.getPage(page))!.notebookId).toBe(notebook);
    expect(await store.historyState(ws)).toMatchObject({ canRedo: true });
    await store.redo(ws);
    expect((await store.getPage(page))!.notebookId).toBe(other);
    await store.undo(ws);
    expect((await store.getPage(page))!.notebookId).toBe(notebook);
  });

  it('undo of create removes an untouched record, and a new command discards redo', async () => {
    await seed();
    const extra = await id(
      store.execute({
        type: 'createFolder',
        workspaceId: ws,
        parentFolderId: null,
        name: 'Geçici',
      }),
    );
    await store.undo(ws);
    expect((await store.workspaceData(ws)).folders.find((f) => f.id === extra)).toBeUndefined();
    await store.execute({
      type: 'createFolder',
      workspaceId: ws,
      parentFolderId: null,
      name: 'Yeni',
    });
    expect((await store.historyState(ws)).canRedo).toBe(false);
  });

  it('undo of create keeps edited content recoverable in the trash', async () => {
    const { page } = await seed();
    const created = await store.execute({
      type: 'createBlock',
      workspaceId: ws,
      pageId: page,
      blockType: 'quickCopy',
    });
    const blockId = created.mutation.primary!.id;
    await store.execute({
      type: 'updateBlock',
      workspaceId: ws,
      id: blockId,
      expectedRevision: 1,
      payload: { title: '', text: 'önemli', format: 'plain' },
    });
    await store.undo(ws);
    expect((await store.getBlocks(page)).find((b) => b.id === blockId)).toBeUndefined();
    const trash = await store.listTrash(ws);
    expect(trash[0]!.root.id).toBe(blockId);
    expect(((trash[0]!.root as Block).payload as { text: string }).text).toBe('önemli');
  });

  it('undo steps back through renames one at a time', async () => {
    const { page } = await seed();
    await store.execute({ type: 'rename', workspaceId: ws, kind: 'page', id: page, name: 'A' });
    await store.execute({ type: 'rename', workspaceId: ws, kind: 'page', id: page, name: 'B' });
    await store.undo(ws);
    expect((await store.getPage(page))!.title).toBe('A');
    await store.undo(ws);
    expect((await store.getPage(page))!.title).toBe('Satellite Systems');
  });

  it('undo refuses with CONFLICT when the record diverged (purged after trash)', async () => {
    const { page } = await seed();
    const [block] = await store.getBlocks(page);
    const trashed = await store.execute({
      type: 'trash',
      workspaceId: ws,
      kind: 'block',
      id: block!.id,
    });
    await store.execute({ type: 'purge', workspaceId: ws, batchId: trashed.mutation.batchId! });
    const error = await store.undo(ws).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('CONFLICT');
  });

  it('trash → undo restores the subtree; restore after manual restore conflicts', async () => {
    const { folder, page } = await seed();
    const trashed = await store.execute({
      type: 'trash',
      workspaceId: ws,
      kind: 'folder',
      id: folder,
    });
    expect(await store.getBlocks(page)).toHaveLength(0);
    expect((await store.listTrash(ws))[0]).toMatchObject({
      batchId: trashed.mutation.batchId,
      count: 4,
    });
    await store.undo(ws);
    expect(await store.getBlocks(page)).toHaveLength(1);
    expect(await store.listTrash(ws)).toHaveLength(0);
  });

  it('rolls back a failing command completely (no partial duplicate)', async () => {
    if (!(store.backend instanceof MemoryBackend)) return;
    const { page } = await seed();
    for (let i = 0; i < 3; i++)
      await store.execute({
        type: 'createBlock',
        workspaceId: ws,
        pageId: page,
        blockType: 'richText',
      });
    const before = await store.workspaceData(ws);
    store.backend.options.failAfterWrites = 2;
    await expect(
      store.execute({ type: 'duplicatePage', workspaceId: ws, id: page, title: 'kopya' }),
    ).rejects.toThrow('Injected');
    store.backend.options.failAfterWrites = undefined;
    const after = await store.workspaceData(ws);
    expect(after.pages).toHaveLength(before.pages.length);
    expect(await store.getBlocks(page)).toHaveLength(4);
  });

  it('rejects stale block updates with a CONFLICT and keeps stored content', async () => {
    const { page } = await seed();
    const [block] = await store.getBlocks(page);
    const payload = block!.payload as Record<string, unknown>;
    await store.execute({
      type: 'updateBlock',
      workspaceId: ws,
      id: block!.id,
      expectedRevision: 1,
      payload: { ...payload, title: 'Tab A' },
    });
    const stale = store.execute({
      type: 'updateBlock',
      workspaceId: ws,
      id: block!.id,
      expectedRevision: 1,
      payload: { ...payload, title: 'Tab B' },
    });
    await expect(stale).rejects.toBeInstanceOf(DomainError);
    expect(((await store.getBlocks(page))[0]!.payload as { title: string }).title).toBe('Tab A');
  });

  it('prunes the log to the history limit without touching data', async () => {
    const small = new WorkspaceStore(await factory(), registry, { historyLimit: 5 });
    const w = (await small.ensureWorkspace({ name: 'w', locale: 'tr-TR', baseCurrency: 'EUR' })).id;
    for (let i = 0; i < 12; i++)
      await small.execute({
        type: 'createFolder',
        workspaceId: w,
        parentFolderId: null,
        name: `f${i}`,
      });
    expect(await small.backend.logs(w)).toHaveLength(5);
    expect((await small.workspaceData(w)).folders).toHaveLength(12);
    small.close();
  });

  it('stores pages with their titles unchanged (Turkish characters)', async () => {
    const { notebook } = await seed();
    const title = 'İçerik ğüşıöç ÇĞİÖŞÜ 🚀';
    const pid = await id(
      store.execute({ type: 'createPage', workspaceId: ws, notebookId: notebook, title }),
    );
    expect(((await store.getPage(pid)) as Page).title).toBe(title);
  });
});

describe('DexieBackend persistence', () => {
  it('reopening the same database returns committed data', async () => {
    const indexedDB = new IDBFactory();
    const name = 'reopen-test';
    const first = new WorkspaceStore(
      new DexieBackend({ name, indexedDB, IDBKeyRange, broadcast: false }),
      registry,
    );
    const w = (await first.ensureWorkspace({ name: 'w', locale: 'tr-TR', baseCurrency: 'EUR' })).id;
    await first.execute({
      type: 'createFolder',
      workspaceId: w,
      parentFolderId: null,
      name: 'Kalıcı',
    });
    first.close();

    const second = new WorkspaceStore(
      new DexieBackend({ name, indexedDB, IDBKeyRange, broadcast: false }),
      registry,
    );
    expect((await second.workspaceData(w)).folders.map((f) => f.name)).toEqual(['Kalıcı']);
    expect((await second.historyState(w)).canUndo).toBe(true);
    second.close();
  });
});
