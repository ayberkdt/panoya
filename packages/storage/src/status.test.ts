import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultRegistry, type TablePayload } from '@panoya/blocks';
import type { DatasetColumn } from '@panoya/domain';
import { MemoryBackend } from './memory';
import { WorkspaceStore } from './store';

const registry = createDefaultRegistry();
const source = {
  kind: 'manual' as const,
  filename: null,
  delimiter: null,
  locale: null,
  importedAt: null,
  original: null,
};
const text = (value: string) => ({ kind: 'text' as const, value });

const statusColumns: DatasetColumn[] = [
  { id: 'name', label: 'Hoca', type: 'text', unit: null, currency: null },
  {
    id: 'mail',
    label: 'Mail Durumu',
    type: 'select',
    unit: null,
    currency: null,
    options: [
      { id: 'notsent', label: 'Atılmadı', color: 'gray' },
      { id: 'sent', label: 'Gönderildi', color: 'blue' },
      { id: 'negative', label: 'Olumsuz', color: 'red' },
    ],
  },
  { id: 'email', label: 'E-posta', type: 'email', unit: null, currency: null },
];

let store: WorkspaceStore;
let ws: string;
let datasetId: string;

beforeEach(async () => {
  store = new WorkspaceStore(new MemoryBackend(), registry);
  ws = (await store.ensureWorkspace({ name: 'w', locale: 'tr-TR', baseCurrency: 'EUR' })).id;
  const nb = (
    await store.execute({ type: 'createNotebook', workspaceId: ws, folderId: null, title: 'N' })
  ).mutation.primary!.id;
  const pageId = (
    await store.execute({ type: 'createPage', workspaceId: ws, notebookId: nb, title: 'P' })
  ).mutation.primary!.id;
  const r = await store.execute({
    type: 'createTableBlock',
    workspaceId: ws,
    pageId,
    title: 'Hocalar',
    columns: statusColumns,
    source,
    rows: [{ cells: { name: text('Dr. Örnek'), mail: { kind: 'select', optionId: 'notsent' } } }],
  });
  const block = r.records.get(r.mutation.primary!.id)!;
  datasetId = (block as unknown as { payload: TablePayload }).payload.datasetId;
});

const setMail = async (rowId: string, optionId: string) =>
  store.execute({
    type: 'updateCells',
    workspaceId: ws,
    datasetId,
    edits: [{ rowId, columnId: 'mail', value: { kind: 'select', optionId } }],
  });

describe('status tracking (select columns + row history)', () => {
  it('records each status change with time and readable labels; untracked columns are not recorded', async () => {
    const [row] = await store.getRows(datasetId);
    await setMail(row!.id, 'sent');
    await store.execute({
      type: 'updateCells',
      workspaceId: ws,
      datasetId,
      edits: [{ rowId: row!.id, columnId: 'name', value: text('Prof. Örnek') }],
    });
    await setMail(row!.id, 'negative');
    const [after] = await store.getRows(datasetId);
    expect(after!.history?.map((h) => [h.column, h.from, h.to])).toEqual([
      ['Mail Durumu', 'Atılmadı', 'Gönderildi'],
      ['Mail Durumu', 'Gönderildi', 'Olumsuz'],
    ]);
    expect(after!.history?.every((h) => /^\d{4}-\d{2}-\d{2}T/.test(h.at))).toBe(true);
  });

  it('setting the same value again adds no history entry', async () => {
    const [row] = await store.getRows(datasetId);
    await setMail(row!.id, 'notsent');
    expect((await store.getRows(datasetId))[0]!.history ?? []).toEqual([]);
  });

  it('rejects unknown options and invalid e-mails atomically', async () => {
    const [row] = await store.getRows(datasetId);
    await expect(setMail(row!.id, 'nope')).rejects.toMatchObject({
      messageKey: 'error.dataset.invalidCells',
    });
    await expect(
      store.execute({
        type: 'updateCells',
        workspaceId: ws,
        datasetId,
        edits: [{ rowId: row!.id, columnId: 'email', value: text('not-an-email') }],
      }),
    ).rejects.toMatchObject({ messageKey: 'error.dataset.invalidCells' });
    await store.execute({
      type: 'updateCells',
      workspaceId: ws,
      datasetId,
      edits: [{ rowId: row!.id, columnId: 'email', value: text('ornek@example.invalid') }],
    });
  });

  it('removing an option empties the cells that used it (undoable); history keeps the label', async () => {
    const [row] = await store.getRows(datasetId);
    await setMail(row!.id, 'sent');
    await store.execute({
      type: 'updateColumn',
      workspaceId: ws,
      datasetId,
      columnId: 'mail',
      options: [
        { id: 'notsent', label: 'Atılmadı', color: 'gray' },
        { id: 'negative', label: 'Olumsuz', color: 'red' },
      ],
    });
    const [after] = await store.getRows(datasetId);
    expect(after!.cells.mail).toBeUndefined();
    expect(after!.history?.at(-1)).toMatchObject({ from: 'Atılmadı', to: 'Gönderildi' });
    await store.undo(ws);
    expect((await store.getRows(datasetId))[0]!.cells.mail).toEqual({
      kind: 'select',
      optionId: 'sent',
    });
  });

  it('rejects duplicate option labels (Turkish case-insensitive)', async () => {
    await expect(
      store.execute({
        type: 'updateColumn',
        workspaceId: ws,
        datasetId,
        columnId: 'mail',
        options: [
          { id: 'a', label: 'Olumlu', color: 'green' },
          { id: 'b', label: 'olumlu', color: 'red' },
        ],
      }),
    ).rejects.toMatchObject({ messageKey: 'error.dataset.columns' });
  });

  it('history can be switched off per column', async () => {
    await store.execute({
      type: 'updateColumn',
      workspaceId: ws,
      datasetId,
      columnId: 'mail',
      trackHistory: false,
    });
    const [row] = await store.getRows(datasetId);
    await setMail(row!.id, 'sent');
    expect((await store.getRows(datasetId))[0]!.history ?? []).toEqual([]);
  });
});
