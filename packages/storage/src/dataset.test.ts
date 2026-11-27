import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultRegistry, type TablePayload } from '@panoya/blocks';
import { DomainError, type DatasetColumn } from '@panoya/domain';
import { DexieBackend } from './dexie';
import { MemoryBackend } from './memory';
import { WorkspaceStore } from './store';

const registry = createDefaultRegistry();
const columns: DatasetColumn[] = [
  { id: 'x', label: 'x', type: 'number', unit: null, currency: null },
  { id: 'y', label: 'y', type: 'number', unit: null, currency: null },
  { id: 'label', label: 'label', type: 'text', unit: null, currency: null },
];
const source = {
  kind: 'manual' as const,
  filename: null,
  delimiter: null,
  locale: null,
  importedAt: null,
  original: null,
};
const num = (value: number) => ({ kind: 'number' as const, value });
const text = (value: string) => ({ kind: 'text' as const, value });

let store: WorkspaceStore;
let ws: string;
let pageId: string;

beforeEach(async () => {
  store = new WorkspaceStore(new MemoryBackend(), registry);
  ws = (await store.ensureWorkspace({ name: 'w', locale: 'tr-TR', baseCurrency: 'EUR' })).id;
  const nb = (
    await store.execute({ type: 'createNotebook', workspaceId: ws, folderId: null, title: 'N' })
  ).mutation.primary!.id;
  pageId = (
    await store.execute({ type: 'createPage', workspaceId: ws, notebookId: nb, title: 'P' })
  ).mutation.primary!.id;
});

async function createTable(
  rows = [
    { cells: { x: num(1), y: num(2), label: text('bir') } },
    { cells: { x: num(0), label: text('sıfır') } },
  ],
) {
  const r = await store.execute({
    type: 'createTableBlock',
    workspaceId: ws,
    pageId,
    title: 'Veri',
    columns,
    rows,
    source,
  });
  const block = r.records.get(r.mutation.primary!.id)!;
  return {
    blockId: block.id,
    datasetId: (block as unknown as { payload: TablePayload }).payload.datasetId,
  };
}

describe('datasets', () => {
  it('creates dataset + rows + table block atomically; missing stays distinct from 0', async () => {
    const { datasetId } = await createTable();
    const rows = await store.getRows(datasetId);
    expect(rows).toHaveLength(2);
    expect(rows[1]!.cells.x).toEqual(num(0)); // 0 is a value
    expect(rows[1]!.cells.y).toBeUndefined(); // missing is absent, not 0
    expect((await store.getDataset(datasetId))!.dataRevision).toBe(1);
  });

  it('rejects an import with any invalid cell and writes nothing (no partial dataset)', async () => {
    const before = (await store.getBlocks(pageId)).length;
    await expect(
      store.execute({
        type: 'createTableBlock',
        workspaceId: ws,
        pageId,
        title: 'Bozuk',
        columns,
        source,
        rows: [{ cells: { x: num(1) } }, { cells: { x: text('abc') } }],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION', details: { count: 1 } });
    expect(await store.getBlocks(pageId)).toHaveLength(before);
  });

  it('bulk cell update is all-or-nothing and bumps the data revision', async () => {
    const { datasetId } = await createTable();
    const [r1, r2] = await store.getRows(datasetId);
    await expect(
      store.execute({
        type: 'updateCells',
        workspaceId: ws,
        datasetId,
        edits: [
          { rowId: r1!.id, columnId: 'x', value: num(5) },
          { rowId: r2!.id, columnId: 'x', value: text('oops') },
        ],
      }),
    ).rejects.toBeInstanceOf(DomainError);
    expect((await store.getRows(datasetId))[0]!.cells.x).toEqual(num(1));

    await store.execute({
      type: 'updateCells',
      workspaceId: ws,
      datasetId,
      edits: [
        { rowId: r1!.id, columnId: 'x', value: num(5) },
        { rowId: r2!.id, columnId: 'y', value: { kind: 'missing' } },
      ],
    });
    const rows = await store.getRows(datasetId);
    expect(rows[0]!.cells.x).toEqual(num(5));
    expect((await store.getDataset(datasetId))!.dataRevision).toBe(2);
  });

  it('undo reverts cell edits in LIFO order', async () => {
    const { datasetId } = await createTable();
    const [r1] = await store.getRows(datasetId);
    await store.execute({
      type: 'updateCells',
      workspaceId: ws,
      datasetId,
      edits: [{ rowId: r1!.id, columnId: 'x', value: num(10) }],
    });
    await store.execute({
      type: 'updateCells',
      workspaceId: ws,
      datasetId,
      edits: [{ rowId: r1!.id, columnId: 'y', value: num(20) }],
    });
    await store.undo(ws);
    expect((await store.getRows(datasetId))[0]!.cells).toMatchObject({ x: num(10), y: num(2) });
    await store.undo(ws);
    expect((await store.getRows(datasetId))[0]!.cells.x).toEqual(num(1));
  });

  it('adds, trashes and restores rows; deleting a column removes its cells', async () => {
    const { datasetId } = await createTable();
    await store.execute({
      type: 'addDatasetRows',
      workspaceId: ws,
      datasetId,
      rows: [{ cells: { x: num(3) } }],
    });
    expect(await store.getRows(datasetId)).toHaveLength(3);
    const [first] = await store.getRows(datasetId);
    const trashed = await store.execute({
      type: 'trashRows',
      workspaceId: ws,
      datasetId,
      rowIds: [first!.id],
    });
    expect(await store.getRows(datasetId)).toHaveLength(2);
    await store.execute({ type: 'restore', workspaceId: ws, batchId: trashed.mutation.batchId! });
    expect(await store.getRows(datasetId)).toHaveLength(3);

    await store.execute({ type: 'deleteColumn', workspaceId: ws, datasetId, columnId: 'label' });
    const rows = await store.getRows(datasetId);
    expect(rows.every((r) => !('label' in r.cells))).toBe(true);
    expect((await store.getDataset(datasetId))!.columns.map((c) => c.id)).toEqual(['x', 'y']);
  });

  it('type change rejects invalid cells unless the user chose missing', async () => {
    const { datasetId } = await createTable();
    const command = {
      type: 'setColumnType' as const,
      workspaceId: ws,
      datasetId,
      columnId: 'label',
      columnType: 'number' as const,
    };
    await expect(store.execute(command)).rejects.toMatchObject({ details: { count: 2 } });
    await store.execute({ ...command, invalidAs: 'missing' });
    const rows = await store.getRows(datasetId);
    expect(rows.every((r) => r.cells.label === undefined)).toBe(true);
  });

  it('money columns require a currency and matching cell currency', async () => {
    const { datasetId } = await createTable();
    await expect(
      store.execute({
        type: 'addColumn',
        workspaceId: ws,
        datasetId,
        column: { id: 'm', label: 'Tutar', type: 'money', unit: null, currency: null },
      }),
    ).rejects.toMatchObject({ messageKey: 'error.dataset.columns' });
    await store.execute({
      type: 'addColumn',
      workspaceId: ws,
      datasetId,
      column: { id: 'm', label: 'Tutar', type: 'money', unit: null, currency: 'EUR' },
    });
    const [r1] = await store.getRows(datasetId);
    await expect(
      store.execute({
        type: 'updateCells',
        workspaceId: ws,
        datasetId,
        edits: [
          {
            rowId: r1!.id,
            columnId: 'm',
            value: { kind: 'money', amount: '300', currency: 'TRY' },
          },
        ],
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await store.execute({
      type: 'updateCells',
      workspaceId: ws,
      datasetId,
      edits: [
        {
          rowId: r1!.id,
          columnId: 'm',
          value: { kind: 'money', amount: '300.50', currency: 'EUR' },
        },
      ],
    });
  });

  it('duplicating a page copies its dataset instead of sharing it', async () => {
    const { datasetId } = await createTable();
    const dup = await store.execute({
      type: 'duplicatePage',
      workspaceId: ws,
      id: pageId,
      title: 'P (kopya)',
    });
    const [copyBlock] = await store.getBlocks(dup.mutation.primary!.id);
    const copyDatasetId = (copyBlock!.payload as TablePayload).datasetId;
    expect(copyDatasetId).not.toBe(datasetId);
    expect(await store.getRows(copyDatasetId)).toHaveLength(2);
    const [cr] = await store.getRows(copyDatasetId);
    await store.execute({
      type: 'updateCells',
      workspaceId: ws,
      datasetId: copyDatasetId,
      edits: [{ rowId: cr!.id, columnId: 'x', value: num(99) }],
    });
    expect((await store.getRows(datasetId))[0]!.cells.x).toEqual(num(1)); // original untouched
  });
});

describe('IndexedDB schema upgrade v1 → v2', () => {
  it('keeps v1 data and adds dataset tables', async () => {
    const indexedDB = new IDBFactory();
    // Simulate a database written by the v1 app (no dataset tables).
    const old = new Dexie('upgrade-test', { indexedDB, IDBKeyRange });
    old.version(1).stores({
      workspaces: 'id',
      folders: 'id, workspaceId, parentFolderId, deleteBatchId',
      notebooks: 'id, workspaceId, folderId, deleteBatchId',
      pages: 'id, workspaceId, notebookId, deleteBatchId',
      blocks: 'id, workspaceId, pageId, deleteBatchId',
      commandLog: 'id, [workspaceId+seq]',
      meta: 'key',
      migrationBackup: '++seq, table, id',
    });
    await old.open();
    const wsId = 'aaaaaaaa-0000-4000-8000-000000000001';
    await old.table('workspaces').put({
      id: wsId,
      name: 'w',
      locale: 'tr-TR',
      baseCurrency: 'EUR',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      schemaVersion: 1,
      localRevision: 1,
    });
    await old.table('folders').put({
      id: 'aaaaaaaa-0000-4000-8000-000000000010',
      workspaceId: wsId,
      kind: 'folder',
      parentFolderId: null,
      name: 'Eski',
      rank: 'a0',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      deletedAt: null,
      trashed: 0,
      deleteBatchId: null,
      schemaVersion: 1,
      localRevision: 1,
      remoteVersion: null,
    });
    await old.table('meta').put({ key: 'recordsSchemaVersion', value: 1 });
    old.close();

    const backend = new DexieBackend({
      name: 'upgrade-test',
      indexedDB,
      IDBKeyRange,
      broadcast: false,
    });
    await backend.open();
    expect(backend.db.verno).toBe(2);
    const upgraded = new WorkspaceStore(backend, registry);
    expect((await upgraded.workspaceData(wsId)).folders.map((f) => f.name)).toEqual(['Eski']);
    expect(await backend.db.datasets.count()).toBe(0);
    upgraded.close();
  });
});
