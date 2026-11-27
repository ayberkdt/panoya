import 'fake-indexeddb/auto';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '@panoya/blocks';
import { DomainError, validateEntity } from '@panoya/domain';
import legacy from '../../../fixtures/legacy-v0-records.json';
import { DexieBackend } from './dexie';
import { migrateEntity } from './migrations';
import { WorkspaceStore } from './store';

describe('record migrations', () => {
  it('upgrades every v0 fixture record to a valid current record', () => {
    for (const raw of legacy.records) {
      const migrated = validateEntity(migrateEntity(raw));
      expect(migrated.schemaVersion).toBe(1);
    }
  });

  it('turns legacy deleted=true into a restorable trash batch', () => {
    const deleted = legacy.records.find((r) => (r as { deleted?: boolean }).deleted === true)!;
    const migrated = validateEntity(migrateEntity(deleted));
    expect(migrated).toMatchObject({ trashed: 1, deleteBatchId: migrated.id });
  });

  it('refuses records from a newer app version instead of downgrading', () => {
    const future = { ...legacy.records[0], schemaVersion: 99 };
    expect(() => migrateEntity(future)).toThrow(DomainError);
  });

  it('reads a database containing legacy rows and can restore the legacy deletion', async () => {
    const indexedDB = new IDBFactory();
    const backend = new DexieBackend({ name: 'legacy', indexedDB, IDBKeyRange, broadcast: false });
    await backend.open();
    await backend.db.workspaces.put(legacy.workspace as never);
    for (const raw of legacy.records) {
      const table = { folder: 'folders', notebook: 'notebooks', page: 'pages', block: 'blocks' }[
        raw.kind as 'folder'
      ] as 'folders';
      await backend.db[table].put(raw as never);
    }
    // Simulate a database written by a pre-release build: no records-version marker.
    await backend.db.meta.delete('recordsSchemaVersion');
    expect(await backend.migrateStoredRecords()).toBe(3);
    expect(await backend.db.migrationBackup.count()).toBe(3);
    expect(await backend.migrateStoredRecords()).toBe(0); // idempotent
    const store = new WorkspaceStore(backend, createDefaultRegistry());
    const ws = legacy.workspace.id;
    const data = await store.workspaceData(ws);
    expect(data.folders).toHaveLength(1);
    const trash = await store.listTrash(ws);
    expect(trash).toHaveLength(1);
    await store.execute({ type: 'restore', workspaceId: ws, batchId: trash[0]!.batchId });
    expect((await store.workspaceData(ws)).pages.every((p) => p.trashed === 0)).toBe(true);
    store.close();
  });
});
