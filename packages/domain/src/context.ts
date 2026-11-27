import type { JsonValue } from './json';
import type { Clock, IdSource } from './env';
import type { CommandType } from './commands';
import type { Entity, EntityKind, EntityOf } from './entities';

/**
 * Read access the planner needs. Implemented by storage inside a transaction so that every read
 * and the resulting writes are atomic. Methods return trashed records too; callers filter.
 */
export interface ReadContext {
  hasWorkspace(workspaceId: string): Promise<boolean>;
  get<K extends EntityKind>(kind: K, id: string): Promise<EntityOf<K> | undefined>;
  /** Children of `parentId` (null = workspace root, only for folders and notebooks). */
  children<K extends EntityKind>(
    kind: K,
    workspaceId: string,
    parentId: string | null,
  ): Promise<EntityOf<K>[]>;
  byBatch(workspaceId: string, batchId: string): Promise<Entity[]>;
}

/** Block-type knowledge injected into the domain so the domain does not depend on blocks. */
export interface BlockCatalog {
  isKnown(type: string): boolean;
  currentVersion(type: string): number;
  createDefault(type: string): JsonValue;
  /** Returns the canonical payload or throws a VALIDATION DomainError. */
  validate(type: string, payload: unknown): JsonValue;
  /** Rewrites internal references (page/block ids) when content is duplicated. */
  remapReferences(
    type: string,
    payload: JsonValue,
    map: (id: string) => string | undefined,
  ): JsonValue;
}

export interface PlannerEnv {
  clock: Clock;
  ids: IdSource;
  blocks: BlockCatalog;
}

export interface Change {
  kind: EntityKind;
  id: string;
  /** null when the record is created by this mutation. */
  before: Entity | null;
  /** null when the record is permanently removed (purge). */
  after: Entity | null;
}

export interface Mutation {
  commandType: CommandType;
  changes: Change[];
  undoable: boolean;
  /** Main record the UI may want to focus or navigate to. */
  primary?: { kind: EntityKind; id: string };
  /** Set by trash so the UI can offer "undo" / restore. */
  batchId?: string;
}
