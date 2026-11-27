import {
  parentIdOf,
  type Entity,
  type EntityKind,
  type EntityOf,
  type Workspace,
} from '@panoya/domain';
import type { CommandLogEntry, StorageBackend, Transaction } from './backend';

interface Tables {
  workspaces: Map<string, Workspace>;
  entities: Record<EntityKind, Map<string, Entity>>;
  logs: Map<string, CommandLogEntry>;
  seq: number;
}

const clone = <T>(value: T): T => structuredClone(value);

function emptyTables(): Tables {
  return {
    workspaces: new Map(),
    entities: { folder: new Map(), notebook: new Map(), page: new Map(), block: new Map() },
    logs: new Map(),
    seq: 0,
  };
}

function copyTables(t: Tables): Tables {
  return {
    workspaces: new Map(t.workspaces),
    entities: {
      folder: new Map(t.entities.folder),
      notebook: new Map(t.entities.notebook),
      page: new Map(t.entities.page),
      block: new Map(t.entities.block),
    },
    logs: new Map(t.logs),
    seq: t.seq,
  };
}

export interface MemoryBackendOptions {
  /** Fault injection for tests: throw after this many entity writes inside a transaction. */
  failAfterWrites?: number;
}

/**
 * In-memory backend with real transaction semantics (copy-on-write staging, serialized
 * transactions, rollback on error). Used for unit tests and as a reference implementation.
 */
export class MemoryBackend implements StorageBackend {
  readonly name = 'memory';
  private tables = emptyTables();
  private queue: Promise<unknown> = Promise.resolve();
  options: MemoryBackendOptions;

  constructor(options: MemoryBackendOptions = {}) {
    this.options = options;
  }

  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const run = async () => {
      const staged = copyTables(this.tables);
      let writes = 0;
      const countWrite = () => {
        writes += 1;
        if (this.options.failAfterWrites !== undefined && writes > this.options.failAfterWrites) {
          throw new Error('Injected storage failure');
        }
      };
      const tx: Transaction = {
        hasWorkspace: async (id) => staged.workspaces.has(id),
        getWorkspace: async (id) => clone(staged.workspaces.get(id)),
        putWorkspace: async (w) => {
          staged.workspaces.set(w.id, clone(w));
        },
        get: async <K extends EntityKind>(kind: K, id: string) =>
          clone(staged.entities[kind].get(id)) as EntityOf<K> | undefined,
        children: async <K extends EntityKind>(
          kind: K,
          workspaceId: string,
          parentId: string | null,
        ) =>
          [...staged.entities[kind].values()]
            .filter((e) => e.workspaceId === workspaceId && parentIdOf(e) === parentId)
            .map(clone) as EntityOf<K>[],
        byBatch: async (workspaceId, batchId) =>
          Object.values(staged.entities)
            .flatMap((m) => [...m.values()])
            .filter((e) => e.workspaceId === workspaceId && e.deleteBatchId === batchId)
            .map(clone),
        put: async (entity) => {
          countWrite();
          staged.entities[entity.kind].set(entity.id, clone(entity));
        },
        remove: async (kind, id) => {
          countWrite();
          staged.entities[kind].delete(id);
        },
        nextSeq: async () => {
          staged.seq += 1;
          return staged.seq;
        },
        putLog: async (entry) => {
          staged.logs.set(entry.id, clone(entry));
        },
        logs: async (workspaceId, limit) => sortedLogs(staged, workspaceId, limit),
        deleteLogs: async (ids) => {
          ids.forEach((id) => staged.logs.delete(id));
        },
      };
      const result = await fn(tx);
      this.tables = staged; // commit
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return [...this.tables.workspaces.values()].map(clone);
  }

  async get<K extends EntityKind>(kind: K, id: string): Promise<EntityOf<K> | undefined> {
    return clone(this.tables.entities[kind].get(id)) as EntityOf<K> | undefined;
  }

  async listKind<K extends 'folder' | 'notebook' | 'page'>(
    kind: K,
    workspaceId: string,
  ): Promise<EntityOf<K>[]> {
    return [...this.tables.entities[kind].values()]
      .filter((e) => e.workspaceId === workspaceId)
      .map(clone) as EntityOf<K>[];
  }

  async blocksOfPage(pageId: string): Promise<EntityOf<'block'>[]> {
    return [...this.tables.entities.block.values()]
      .filter((b) => b.kind === 'block' && b.pageId === pageId)
      .map(clone) as EntityOf<'block'>[];
  }

  async listTrashed(workspaceId: string): Promise<Entity[]> {
    return Object.values(this.tables.entities)
      .flatMap((m) => [...m.values()])
      .filter((e) => e.workspaceId === workspaceId && e.trashed === 1)
      .map(clone);
  }

  async logs(workspaceId: string, limit?: number): Promise<CommandLogEntry[]> {
    return sortedLogs(this.tables, workspaceId, limit);
  }

  close(): void {}
}

function sortedLogs(t: Tables, workspaceId: string, limit?: number): CommandLogEntry[] {
  const list = [...t.logs.values()]
    .filter((l) => l.workspaceId === workspaceId)
    .sort((a, b) => b.seq - a.seq);
  return (limit === undefined ? list : list.slice(0, limit)).map(clone);
}
