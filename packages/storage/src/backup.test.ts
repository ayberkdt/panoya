import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultRegistry, type TablePayload } from '@panoya/blocks';
import type { Block, DatasetColumn } from '@panoya/domain';
import type { BackupError } from './backup';
import {
  exportBackup,
  inspectBackup,
  restoreBackup,
  semanticSnapshot,
  snapshotWorkspace,
} from './backup';
import { MemoryBackend } from './memory';
import { WorkspaceStore } from './store';

const registry = createDefaultRegistry();
let store: WorkspaceStore;
let ws: string;

async function seed() {
  const exec = async (c: Parameters<WorkspaceStore['execute']>[0]) =>
    (await store.execute(c)).mutation;
  const folder = (
    await exec({ type: 'createFolder', workspaceId: ws, parentFolderId: null, name: 'Üniversite' })
  ).primary!.id;
  const nb = (
    await exec({ type: 'createNotebook', workspaceId: ws, folderId: folder, title: 'Linkler' })
  ).primary!.id;
  const page = (
    await exec({
      type: 'createPage',
      workspaceId: ws,
      notebookId: nb,
      title: 'Satellite Systems',
      blocks: [
        {
          type: 'link',
          payload: {
            title: 'Yoklama',
            url: 'https://example.invalid/attendance?course=demo#form',
            description: '',
            category: '',
            tags: [],
          },
        },
        {
          type: 'quickCopy',
          payload: { title: 'İmza', text: 'Saygılarımla,\nÖrnek', format: 'plain' },
        },
      ],
    })
  ).primary!.id;
  const columns: DatasetColumn[] = [
    { id: 'a', label: 'Kalem', type: 'text', unit: null, currency: null },
    { id: 'b', label: 'Tutar', type: 'money', unit: null, currency: 'EUR' },
  ];
  await exec({
    type: 'createTableBlock',
    workspaceId: ws,
    pageId: page,
    title: 'Varlıklar',
    columns,
    rows: [
      {
        cells: {
          a: { kind: 'text', value: 'Nakit' },
          b: { kind: 'money', amount: '300', currency: 'EUR' },
        },
      },
      { cells: { a: { kind: 'text', value: 'Banka' } } },
    ],
    source: {
      kind: 'manual',
      filename: null,
      delimiter: null,
      locale: null,
      importedAt: null,
      original: null,
    },
  });
  // Something in the trash must survive the round trip too.
  const extra = (
    await exec({ type: 'createPage', workspaceId: ws, notebookId: nb, title: 'Silinecek' })
  ).primary!.id;
  await exec({ type: 'trash', workspaceId: ws, kind: 'page', id: extra });
  return { page };
}

beforeEach(async () => {
  store = new WorkspaceStore(new MemoryBackend(), registry);
  ws = (
    await store.ensureWorkspace({ name: 'Çalışma alanım', locale: 'tr-TR', baseCurrency: 'EUR' })
  ).id;
});

describe('backup round trip', () => {
  it('export → inspect → restore reproduces the workspace semantically (ids remapped on collision)', async () => {
    await seed();
    const { bytes, manifest } = await exportBackup(store.backend, registry, ws, {
      appVersion: 'test',
    });
    expect(manifest.counts).toMatchObject({
      folder: 1,
      notebook: 1,
      page: 2,
      block: 3,
      dataset: 1,
      datasetRow: 2,
    });

    const preview = await inspectBackup(bytes, registry);
    expect(preview.unknownBlockTypes).toEqual([]);
    expect(preview.danglingReferences).toBe(0);

    // Same database → every id collides → full remap into a new workspace.
    const restored = await restoreBackup(store.backend, registry, preview, {
      name: 'Geri yüklenen',
    });
    expect(restored.remapped).toBe(true);
    expect(restored.workspaceId).not.toBe(ws);

    const original = await snapshotWorkspace(store.backend, ws);
    const copy = await snapshotWorkspace(store.backend, restored.workspaceId);
    expect(semanticSnapshot(copy)).toEqual(semanticSnapshot(original));

    // Internal references point inside the restored workspace (table → its dataset copy).
    const table = copy.entities.block.find((b) => (b as Block).type === 'table') as Block;
    const datasetId = (table.payload as TablePayload).datasetId;
    expect(copy.entities.dataset.map((d) => d.id)).toContain(datasetId);
    // Original ids and the trash batch are preserved structurally.
    expect(copy.entities.page.filter((p) => p.trashed === 1)).toHaveLength(1);
    expect((await store.listTrash(restored.workspaceId))[0]?.count).toBe(1);
  });

  it('restores with original ids into an empty database', async () => {
    await seed();
    const { bytes } = await exportBackup(store.backend, registry, ws, { appVersion: 'test' });
    const fresh = new WorkspaceStore(new MemoryBackend(), registry);
    const preview = await inspectBackup(bytes, registry);
    const restored = await restoreBackup(fresh.backend, registry, preview, { name: 'Taşınan' });
    expect(restored).toEqual({ workspaceId: ws, remapped: false });
    const a = await snapshotWorkspace(store.backend, ws);
    const b = await snapshotWorkspace(fresh.backend, ws);
    expect(b.entities.block.map((e) => e.id).sort()).toEqual(
      a.entities.block.map((e) => e.id).sort(),
    );
  });

  it('writes human-readable Markdown including tables', async () => {
    await seed();
    const { bytes } = await exportBackup(store.backend, registry, ws, { appVersion: 'test' });
    const files = unzipSync(bytes);
    const md = strFromU8(files['readable/Üniversite/Linkler/Satellite Systems.md']!);
    expect(md).toContain('# Satellite Systems');
    expect(md).toContain('[Yoklama](https://example.invalid/attendance?course=demo#form)');
    expect(md).toContain('| Nakit | 300 EUR |');
    expect(md).toContain('| Banka | — |');
  });
});

describe('malicious or broken archives are rejected before any write', () => {
  async function exported() {
    await seed();
    return unzipSync(
      (await exportBackup(store.backend, registry, ws, { appVersion: 'test' })).bytes,
    );
  }
  const rezip = (files: Record<string, Uint8Array>) => zipSync(files);
  const code = async (bytes: Uint8Array) =>
    (await inspectBackup(bytes, registry).catch((e: unknown) => e)) as BackupError;

  it('path traversal', async () => {
    const files = await exported();
    files['../../evil.json'] = strToU8('{}');
    expect((await code(rezip(files))).messageKey).toBe('error.backup.unsafePath');
  });

  it('absolute and unexpected paths', async () => {
    const files = await exported();
    files['entities/x.exe'] = strToU8('MZ');
    expect((await code(rezip(files))).messageKey).toBe('error.backup.unsafePath');
  });

  it('ZIP bomb (extreme compression ratio)', async () => {
    const files = await exported();
    files['readable/bomb.md'] = new Uint8Array(30 * 1024 * 1024); // 30 MB of zeros compresses ~1000:1
    expect((await code(zipSync(files, { level: 9 }))).messageKey).toBe('error.backup.bomb');
  });

  it('tampered file (checksum mismatch)', async () => {
    const files = await exported();
    files['entities/pages.json'] = strToU8(
      strFromU8(files['entities/pages.json']!).replace('Satellite', 'Hacked'),
    );
    expect((await code(rezip(files))).messageKey).toBe('error.backup.checksum');
  });

  it('missing manifest, not a zip, newer format', async () => {
    const files = await exported();
    const { 'manifest.json': manifest, ...rest } = files;
    expect((await code(rezip(rest))).messageKey).toBe('error.backup.noManifest');
    expect((await code(strToU8('hello'))).messageKey).toBe('error.backup.notZip');
    const m = JSON.parse(strFromU8(manifest!));
    m.formatVersion = 99;
    expect(
      (await code(rezip({ ...rest, 'manifest.json': strToU8(JSON.stringify(m)) }))).messageKey,
    ).toBe('error.backup.newerFormat');
  });

  it('malformed JSON and invalid records', async () => {
    const files = await exported();
    const manifest = JSON.parse(strFromU8(files['manifest.json']!));
    const bad = strToU8('[{"kind":"page","id":"nope"}]');
    const digest = await crypto.subtle.digest('SHA-256', bad);
    manifest.checksums['entities/pages.json'] = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    files['entities/pages.json'] = bad;
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    expect((await code(rezip(files))).messageKey).toBe('error.backup.invalidRecord');
  });

  it('a failing restore leaves the database untouched', async () => {
    const files = await exported();
    const preview = await inspectBackup(rezip(files), registry);
    const backend = new MemoryBackend({ failAfterWrites: 3 });
    const target = new WorkspaceStore(backend, registry);
    await expect(restoreBackup(backend, registry, preview, { name: 'x' })).rejects.toThrow(
      'Injected',
    );
    expect(await target.listWorkspaces()).toEqual([]);
  });
});
