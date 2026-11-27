import type {
  Change,
  CommandType,
  Entity,
  EntityKind,
  EntityOf,
  ReadContext,
  Workspace,
} from '@panoya/domain';

/**
 * One entry of the durable command log. Doubles as the revision history (before/after per record)
 * and as the global undo stack.
 *
 * - `applied`   undoable command currently in effect
 * - `undone`    undoable command reverted by an undo entry; can be redone
 * - `discarded` undone command whose redo was invalidated by a newer command
 * - `record`    non-undoable change (typing autosave, purge, undo/redo applications)
 */
export interface CommandLogEntry {
  id: string;
  workspaceId: string;
  seq: number;
  commandType: CommandType | 'undo' | 'redo';
  createdAt: string;
  status: 'applied' | 'undone' | 'discarded' | 'record';
  changes: Change[];
  batchId?: string;
  /** For undo/redo entries: the command entry they act on. */
  targetId?: string;
  /** For `undone` entries: seq of the undo entry, so the last undone is redone first. */
  undoSeq?: number;
}

export interface Transaction extends ReadContext {
  /** Every record of a kind in a workspace, trashed included (backup snapshot, import). */
  listByWorkspace<K extends EntityKind>(kind: K, workspaceId: string): Promise<EntityOf<K>[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  putWorkspace(workspace: Workspace): Promise<void>;
  put(entity: Entity): Promise<void>;
  remove(kind: EntityKind, id: string): Promise<void>;
  nextSeq(): Promise<number>;
  putLog(entry: CommandLogEntry): Promise<void>;
  /** Log entries of a workspace, newest first. */
  logs(workspaceId: string, limit?: number): Promise<CommandLogEntry[]>;
  deleteLogs(ids: string[]): Promise<void>;
}

export interface StorageBackend {
  readonly name: string;
  /** Runs `fn` atomically: either every write commits or none does. */
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  listWorkspaces(): Promise<Workspace[]>;
  get<K extends EntityKind>(kind: K, id: string): Promise<EntityOf<K> | undefined>;
  /** Every record of a kind in a workspace, including trashed ones (folders, notebooks, pages). */
  listKind<K extends 'folder' | 'notebook' | 'page'>(
    kind: K,
    workspaceId: string,
  ): Promise<EntityOf<K>[]>;
  blocksOfPage(pageId: string): Promise<EntityOf<'block'>[]>;
  /** Every block of a workspace including trashed ones (search index build, backup). */
  blocksOfWorkspace(workspaceId: string): Promise<EntityOf<'block'>[]>;
  rowsOfDataset(datasetId: string): Promise<EntityOf<'datasetRow'>[]>;
  /** Every trashed record of a workspace. */
  listTrashed(workspaceId: string): Promise<Entity[]>;
  logs(workspaceId: string, limit?: number): Promise<CommandLogEntry[]>;
  /** Cross-tab change notifications; returns an unsubscribe function. */
  onExternalChange?(listener: (message: ExternalChangeMessage) => void): () => void;
  broadcast?(message: ExternalChangeMessage): void;
  close(): void;
}

export interface ExternalChangeMessage {
  workspaceId: string;
  kinds: EntityKind[];
  ids: string[];
  pageIds: string[];
}
