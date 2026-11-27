import {
  ENTITY_SCHEMA_VERSION,
  parentIdOf,
  planCommand,
  systemClock,
  cryptoIds,
  validateEntity,
  type BlockCatalog,
  type Change,
  type Clock,
  type DomainCommand,
  type Entity,
  type EntityKind,
  type IdSource,
  type Locale,
  type Mutation,
  type Workspace,
  type Block,
  type Folder,
  type Notebook,
  type Page,
} from '@panoya/domain';
import type {
  CommandLogEntry,
  ExternalChangeMessage,
  StorageBackend,
  Transaction,
} from './backend';
import { invertChanges } from './history';

export interface ChangeSet {
  workspaceId: string;
  kinds: ReadonlySet<EntityKind>;
  ids: ReadonlySet<string>;
  /** Pages whose block list or own record changed. */
  pageIds: ReadonlySet<string>;
  origin: 'local' | 'other-tab';
}

export interface CommandResult {
  commandId: string;
  mutation: Mutation;
  /** Current state of every record touched, keyed by id (absent when purged). */
  records: ReadonlyMap<string, Entity>;
}

export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  undoType: string | null;
  redoType: string | null;
}

export interface TrashEntry {
  batchId: string;
  root: Folder | Notebook | Page | Block;
  count: number;
  deletedAt: string;
}

export interface WorkspaceData {
  folders: Folder[];
  notebooks: Notebook[];
  pages: Page[];
}

export interface StoreOptions {
  clock?: Clock;
  ids?: IdSource;
  /** Max log entries kept per workspace; older revisions are pruned, canonical data never is. */
  historyLimit?: number;
}

/**
 * The single write path of the application (spec 02): UI intent → validated command → atomic
 * transaction (records + command log) → change notification. Nothing else mutates storage.
 */
export class WorkspaceStore {
  private readonly listeners = new Set<(change: ChangeSet) => void>();
  private readonly clock: Clock;
  private readonly ids: IdSource;
  private readonly historyLimit: number;
  private readonly unsubscribeExternal: () => void;

  constructor(
    readonly backend: StorageBackend,
    private readonly blocks: BlockCatalog,
    options: StoreOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.ids = options.ids ?? cryptoIds;
    this.historyLimit = options.historyLimit ?? 200;
    this.unsubscribeExternal =
      backend.onExternalChange?.((message) => this.emit(fromMessage(message, 'other-tab'))) ??
      (() => undefined);
  }

  // ------------------------------------------------------------------------------- commands

  async execute(command: DomainCommand): Promise<CommandResult> {
    const result = await this.backend.transaction(async (tx) => {
      const mutation = await planCommand(command, tx, {
        clock: this.clock,
        ids: this.ids,
        blocks: this.blocks,
      });
      const commandId = this.ids.newId();
      await applyChanges(tx, mutation.changes);
      if (mutation.undoable)
        await this.discardRedo(tx, mutation.changes[0]?.after?.workspaceId ?? command.workspaceId);
      const entry: CommandLogEntry = {
        id: commandId,
        workspaceId: command.workspaceId,
        seq: await tx.nextSeq(),
        commandType: mutation.commandType,
        createdAt: this.clock.now(),
        status: mutation.undoable ? 'applied' : 'record',
        changes: mutation.changes,
      };
      if (mutation.batchId) entry.batchId = mutation.batchId;
      await tx.putLog(entry);
      await this.prune(tx, command.workspaceId);
      return { commandId, mutation, records: recordsOf(mutation.changes) };
    });
    this.notify(command.workspaceId, result.mutation.changes);
    return result;
  }

  /** Reverts the most recent undoable command; returns null when there is nothing to undo. */
  async undo(workspaceId: string): Promise<CommandResult | null> {
    const result = await this.backend.transaction(async (tx) => {
      const logs = await tx.logs(workspaceId, this.historyLimit);
      const target = logs.find((l) => l.status === 'applied');
      if (!target) return null;
      const changes = await invertChanges(tx, target.changes, { clock: this.clock, ids: this.ids });
      await applyChanges(tx, changes);
      const seq = await tx.nextSeq();
      const entry: CommandLogEntry = {
        id: this.ids.newId(),
        workspaceId,
        seq,
        commandType: 'undo',
        createdAt: this.clock.now(),
        status: 'record',
        changes,
        targetId: target.id,
      };
      await tx.putLog(entry);
      await tx.putLog({ ...target, status: 'undone', undoSeq: seq });
      return { commandId: entry.id, changes, commandType: target.commandType };
    });
    if (!result) return null;
    this.notify(workspaceId, result.changes);
    return {
      commandId: result.commandId,
      mutation: {
        commandType: result.commandType as Mutation['commandType'],
        changes: result.changes,
        undoable: false,
      },
      records: recordsOf(result.changes),
    };
  }

  /** Re-applies the most recently undone command, if no newer command invalidated it. */
  async redo(workspaceId: string): Promise<CommandResult | null> {
    const result = await this.backend.transaction(async (tx) => {
      const logs = await tx.logs(workspaceId, this.historyLimit);
      const target = logs
        .filter((l) => l.status === 'undone')
        .sort((a, b) => (b.undoSeq ?? 0) - (a.undoSeq ?? 0))[0];
      if (!target) return null;
      const undoEntry = logs.find(
        (l) => l.commandType === 'undo' && l.targetId === target.id && l.seq === target.undoSeq,
      );
      if (!undoEntry) return null;
      const changes = await invertChanges(tx, undoEntry.changes, {
        clock: this.clock,
        ids: this.ids,
      });
      await applyChanges(tx, changes);
      const entry: CommandLogEntry = {
        id: this.ids.newId(),
        workspaceId,
        seq: await tx.nextSeq(),
        commandType: 'redo',
        createdAt: this.clock.now(),
        status: 'record',
        changes,
        targetId: target.id,
      };
      await tx.putLog(entry);
      // The command is in effect again; its "after" now is what redo wrote.
      const afterById = new Map(changes.map((c) => [c.id, c.after]));
      const refreshed: Change[] = target.changes.map((c) =>
        afterById.has(c.id) ? { ...c, after: afterById.get(c.id) ?? null } : c,
      );
      const { undoSeq: _ignored, ...rest } = target;
      void _ignored;
      await tx.putLog({ ...rest, status: 'applied', changes: refreshed });
      return { commandId: entry.id, changes, commandType: target.commandType };
    });
    if (!result) return null;
    this.notify(workspaceId, result.changes);
    return {
      commandId: result.commandId,
      mutation: {
        commandType: result.commandType as Mutation['commandType'],
        changes: result.changes,
        undoable: false,
      },
      records: recordsOf(result.changes),
    };
  }

  async historyState(workspaceId: string): Promise<HistoryState> {
    const logs = await this.backend.logs(workspaceId, this.historyLimit);
    const undo = logs.find((l) => l.status === 'applied');
    const redo = logs
      .filter((l) => l.status === 'undone')
      .sort((a, b) => (b.undoSeq ?? 0) - (a.undoSeq ?? 0))[0];
    return {
      canUndo: undo !== undefined,
      canRedo: redo !== undefined,
      undoType: undo?.commandType ?? null,
      redoType: redo?.commandType ?? null,
    };
  }

  private async discardRedo(tx: Transaction, workspaceId: string): Promise<void> {
    const logs = await tx.logs(workspaceId, this.historyLimit);
    for (const log of logs)
      if (log.status === 'undone') await tx.putLog({ ...log, status: 'discarded' });
  }

  private async prune(tx: Transaction, workspaceId: string): Promise<void> {
    const logs = await tx.logs(workspaceId);
    if (logs.length <= this.historyLimit) return;
    await tx.deleteLogs(logs.slice(this.historyLimit).map((l) => l.id));
  }

  // ------------------------------------------------------------------------------- workspaces

  async listWorkspaces(): Promise<Workspace[]> {
    return this.backend.listWorkspaces();
  }

  /** Returns the first workspace, creating an empty one on first launch (no demo content). */
  async ensureWorkspace(defaults: {
    name: string;
    locale: Locale;
    baseCurrency: string;
  }): Promise<Workspace> {
    const existing = (await this.backend.listWorkspaces()).sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    if (existing[0]) return existing[0];
    return this.backend.transaction(async (tx) => {
      const now = this.clock.now();
      const workspace: Workspace = {
        id: this.ids.newId(),
        name: defaults.name,
        locale: defaults.locale,
        baseCurrency: defaults.baseCurrency,
        createdAt: now,
        updatedAt: now,
        schemaVersion: ENTITY_SCHEMA_VERSION,
        localRevision: 1,
      };
      await tx.putWorkspace(workspace);
      return workspace;
    });
  }

  // ------------------------------------------------------------------------------- queries

  async workspaceData(workspaceId: string): Promise<WorkspaceData> {
    const [folders, notebooks, pages] = await Promise.all([
      this.backend.listKind('folder', workspaceId),
      this.backend.listKind('notebook', workspaceId),
      this.backend.listKind('page', workspaceId),
    ]);
    return { folders, notebooks, pages };
  }

  getPage(id: string): Promise<Page | undefined> {
    return this.backend.get('page', id);
  }

  async getBlocks(pageId: string): Promise<Block[]> {
    return (await this.backend.blocksOfPage(pageId)).filter((b) => b.trashed === 0);
  }

  async listTrash(workspaceId: string): Promise<TrashEntry[]> {
    const trashed = await this.backend.listTrashed(workspaceId);
    const byBatch = new Map<string, Entity[]>();
    for (const e of trashed) {
      if (!e.deleteBatchId) continue;
      const list = byBatch.get(e.deleteBatchId) ?? [];
      list.push(e);
      byBatch.set(e.deleteBatchId, list);
    }
    const entries: TrashEntry[] = [];
    for (const [batchId, members] of byBatch) {
      const ids = new Set(members.map((m) => m.id));
      const root = members.find((m) => {
        const parent = parentIdOf(m);
        return parent === null || !ids.has(parent);
      });
      if (!root) continue;
      entries.push({
        batchId,
        root,
        count: members.length,
        deletedAt: root.deletedAt ?? root.updatedAt,
      });
    }
    return entries.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }

  // ------------------------------------------------------------------------------- notifications

  subscribe(listener: (change: ChangeSet) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(workspaceId: string, changes: readonly Change[]): void {
    if (changes.length === 0) return;
    const message: ExternalChangeMessage = {
      workspaceId,
      kinds: [...new Set(changes.map((c) => c.kind))],
      ids: changes.map((c) => c.id),
      pageIds: [...pageIdsOf(changes)],
    };
    this.emit(fromMessage(message, 'local'));
    this.backend.broadcast?.(message);
  }

  private emit(change: ChangeSet): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        // A failing view must not break the write path or other listeners.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  close(): void {
    this.unsubscribeExternal();
    this.listeners.clear();
    this.backend.close();
  }
}

async function applyChanges(tx: Transaction, changes: readonly Change[]): Promise<void> {
  for (const change of changes) {
    if (change.after === null) await tx.remove(change.kind, change.id);
    else await tx.put(validateEntity(change.after));
  }
}

function recordsOf(changes: readonly Change[]): Map<string, Entity> {
  const map = new Map<string, Entity>();
  for (const c of changes) if (c.after) map.set(c.id, c.after);
  return map;
}

function pageIdsOf(changes: readonly Change[]): Set<string> {
  const ids = new Set<string>();
  for (const c of changes) {
    for (const e of [c.before, c.after]) {
      if (!e) continue;
      if (e.kind === 'page') ids.add(e.id);
      if (e.kind === 'block') ids.add(e.pageId);
    }
  }
  return ids;
}

function fromMessage(message: ExternalChangeMessage, origin: ChangeSet['origin']): ChangeSet {
  return {
    workspaceId: message.workspaceId,
    kinds: new Set(message.kinds),
    ids: new Set(message.ids),
    pageIds: new Set(message.pageIds),
    origin,
  };
}
