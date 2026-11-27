import Dexie, { type Table } from 'dexie';
import {
  ENTITY_SCHEMA_VERSION,
  parentIdOf,
  validateEntity,
  type Entity,
  type EntityKind,
  type EntityOf,
  type Workspace,
  workspaceSchema,
} from '@panoya/domain';
import type {
  CommandLogEntry,
  ExternalChangeMessage,
  StorageBackend,
  Transaction,
} from './backend';
import { migrateEntity, migrateWorkspace } from './migrations';

const tableOf = {
  folder: 'folders',
  notebook: 'notebooks',
  page: 'pages',
  block: 'blocks',
} as const;

interface MetaRow {
  key: string;
  value: number;
}

/**
 * IndexedDB schema (ADR-004). `null` cannot be indexed, so root-level children are found through
 * the workspace index and filtered; trashed records are reachable through `deleteBatchId`, which
 * is only set (and therefore only indexed) while a record is in the trash.
 */
export class PanoyaDatabase extends Dexie {
  workspaces!: Table<Workspace, string>;
  folders!: Table<EntityOf<'folder'>, string>;
  notebooks!: Table<EntityOf<'notebook'>, string>;
  pages!: Table<EntityOf<'page'>, string>;
  blocks!: Table<EntityOf<'block'>, string>;
  commandLog!: Table<CommandLogEntry, string>;
  meta!: Table<MetaRow, string>;
  migrationBackup!: Table<
    { seq?: number; table: string; id: string; row: unknown; at: string },
    number
  >;

  constructor(name: string, options?: ConstructorParameters<typeof Dexie>[1]) {
    super(name, options);
    this.version(1).stores({
      workspaces: 'id',
      folders: 'id, workspaceId, parentFolderId, deleteBatchId',
      notebooks: 'id, workspaceId, folderId, deleteBatchId',
      pages: 'id, workspaceId, notebookId, deleteBatchId',
      blocks: 'id, workspaceId, pageId, deleteBatchId',
      commandLog: 'id, [workspaceId+seq]',
      meta: 'key',
      /** Original rows rewritten by a record migration (spec 00: save originals first). */
      migrationBackup: '++seq, table, id',
    });
    // A brand-new database contains only current records.
    this.on('populate', (tx) => {
      void tx.table('meta').put({ key: RECORDS_VERSION_KEY, value: ENTITY_SCHEMA_VERSION });
    });
  }
}

const RECORDS_VERSION_KEY = 'recordsSchemaVersion';

const allTables = [
  'workspaces',
  'folders',
  'notebooks',
  'pages',
  'blocks',
  'commandLog',
  'meta',
] as const;
const recordTables = ['folders', 'notebooks', 'pages', 'blocks'] as const;

export interface DexieBackendOptions {
  /** Database name; one per local profile/account namespace. */
  name?: string;
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
  /** Set false to disable cross-tab BroadcastChannel notifications (tests). */
  broadcast?: boolean;
}

export class DexieBackend implements StorageBackend {
  readonly name: string;
  readonly db: PanoyaDatabase;
  private readonly channel: BroadcastChannel | null;

  constructor(options: DexieBackendOptions = {}) {
    this.name = options.name ?? 'panoya-local';
    const dexieOptions: ConstructorParameters<typeof Dexie>[1] = {};
    if (options.indexedDB) dexieOptions.indexedDB = options.indexedDB;
    if (options.IDBKeyRange) dexieOptions.IDBKeyRange = options.IDBKeyRange;
    this.db = new PanoyaDatabase(this.name, dexieOptions);
    this.channel =
      options.broadcast !== false && typeof BroadcastChannel !== 'undefined'
        ? new BroadcastChannel(`panoya:changes:${this.name}`)
        : null;
  }

  /**
   * Opens the database (surfacing blocked upgrades and version errors as rejections) and brings
   * stored records to the current schema version so index-based queries see migrated fields.
   */
  async open(): Promise<void> {
    await this.db.open();
    await this.migrateStoredRecords();
  }

  /**
   * One-time eager migration of rows older than the current schema. Originals are copied to
   * `migrationBackup` in the same transaction; on any failure nothing is rewritten.
   */
  async migrateStoredRecords(): Promise<number> {
    const db = this.db;
    const done = await db.meta.get(RECORDS_VERSION_KEY);
    if (done && done.value >= ENTITY_SCHEMA_VERSION) return 0;
    return db.transaction(
      'rw',
      [...recordTables.map((t) => db[t]), db.meta, db.migrationBackup],
      async () => {
        let rewritten = 0;
        const at = new Date().toISOString();
        for (const table of recordTables) {
          const rows = (await db[table].toArray()) as unknown as Record<string, unknown>[];
          for (const row of rows) {
            if (row.schemaVersion === ENTITY_SCHEMA_VERSION) continue;
            const migrated = validateEntity(migrateEntity(row));
            await db.migrationBackup.add({ table, id: migrated.id, row, at });
            await db[table].put(migrated as never);
            rewritten++;
          }
        }
        await db.meta.put({ key: RECORDS_VERSION_KEY, value: ENTITY_SCHEMA_VERSION });
        return rewritten;
      },
    );
  }

  private table<K extends EntityKind>(kind: K): Table<EntityOf<K>, string> {
    return this.db[tableOf[kind]] as unknown as Table<EntityOf<K>, string>;
  }

  private read<K extends EntityKind>(raw: unknown): EntityOf<K> {
    return validateEntity(migrateEntity(raw)) as EntityOf<K>;
  }

  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const db = this.db;
    return db.transaction(
      'rw',
      allTables.map((t) => db[t]),
      async () => {
        const tx: Transaction = {
          hasWorkspace: async (id) => (await db.workspaces.get(id)) !== undefined,
          getWorkspace: async (id) => {
            const raw = await db.workspaces.get(id);
            return raw === undefined ? undefined : workspaceSchema.parse(migrateWorkspace(raw));
          },
          putWorkspace: async (w) => {
            await db.workspaces.put(workspaceSchema.parse(w));
          },
          get: async <K extends EntityKind>(kind: K, id: string) => {
            const raw = await this.table(kind).get(id);
            return raw === undefined ? undefined : this.read<K>(raw);
          },
          children: async <K extends EntityKind>(
            kind: K,
            workspaceId: string,
            parentId: string | null,
          ) => {
            let rows: unknown[];
            if (parentId === null) {
              rows = await this.table(kind).where('workspaceId').equals(workspaceId).toArray();
            } else {
              const field = {
                folder: 'parentFolderId',
                notebook: 'folderId',
                page: 'notebookId',
                block: 'pageId',
              }[kind];
              rows = await this.table(kind).where(field).equals(parentId).toArray();
            }
            return rows
              .map((r) => this.read<K>(r))
              .filter((e) => e.workspaceId === workspaceId && parentIdOf(e) === parentId);
          },
          byBatch: async (workspaceId, batchId) => {
            const out: Entity[] = [];
            for (const kind of ['folder', 'notebook', 'page', 'block'] as const) {
              const rows = await this.table(kind).where('deleteBatchId').equals(batchId).toArray();
              out.push(
                ...rows.map((r) => this.read(r)).filter((e) => e.workspaceId === workspaceId),
              );
            }
            return out;
          },
          put: async (entity) => {
            await this.table(entity.kind).put(validateEntity(entity) as never);
          },
          remove: async (kind, id) => {
            await this.table(kind).delete(id);
          },
          nextSeq: async () => {
            const row = await db.meta.get('logSeq');
            const value = (row?.value ?? 0) + 1;
            await db.meta.put({ key: 'logSeq', value });
            return value;
          },
          putLog: async (entry) => {
            await db.commandLog.put(entry);
          },
          logs: (workspaceId, limit) => this.logsIn(workspaceId, limit),
          deleteLogs: async (ids) => {
            await db.commandLog.bulkDelete(ids);
          },
        };
        return fn(tx);
      },
    );
  }

  private async logsIn(workspaceId: string, limit?: number): Promise<CommandLogEntry[]> {
    let collection = this.db.commandLog
      .where('[workspaceId+seq]')
      .between([workspaceId, Dexie.minKey], [workspaceId, Dexie.maxKey])
      .reverse();
    if (limit !== undefined) collection = collection.limit(limit);
    return collection.toArray();
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const rows = await this.db.workspaces.toArray();
    return rows.map((r) => workspaceSchema.parse(migrateWorkspace(r)));
  }

  async get<K extends EntityKind>(kind: K, id: string): Promise<EntityOf<K> | undefined> {
    const raw = await this.table(kind).get(id);
    return raw === undefined ? undefined : this.read<K>(raw);
  }

  async listKind<K extends 'folder' | 'notebook' | 'page'>(
    kind: K,
    workspaceId: string,
  ): Promise<EntityOf<K>[]> {
    const rows = await this.table(kind).where('workspaceId').equals(workspaceId).toArray();
    return rows.map((r) => this.read<K>(r));
  }

  async blocksOfPage(pageId: string): Promise<EntityOf<'block'>[]> {
    const rows = await this.db.blocks.where('pageId').equals(pageId).toArray();
    return rows.map((r) => this.read<'block'>(r));
  }

  async listTrashed(workspaceId: string): Promise<Entity[]> {
    const out: Entity[] = [];
    for (const kind of ['folder', 'notebook', 'page', 'block'] as const) {
      // Only trashed records carry a deleteBatchId, so the index contains exactly the trash.
      const rows = await this.table(kind).where('deleteBatchId').above('').toArray();
      out.push(...rows.map((r) => this.read(r)).filter((e) => e.workspaceId === workspaceId));
    }
    return out;
  }

  logs(workspaceId: string, limit?: number): Promise<CommandLogEntry[]> {
    return this.logsIn(workspaceId, limit);
  }

  onExternalChange(listener: (message: ExternalChangeMessage) => void): () => void {
    const channel = this.channel;
    if (!channel) return () => undefined;
    const handler = (event: MessageEvent<ExternalChangeMessage>) => listener(event.data);
    channel.addEventListener('message', handler);
    return () => channel.removeEventListener('message', handler);
  }

  broadcast(message: ExternalChangeMessage): void {
    this.channel?.postMessage(message);
  }

  close(): void {
    this.channel?.close();
    this.db.close();
  }
}
