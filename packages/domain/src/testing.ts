import type { BlockCatalog, Mutation, ReadContext } from './context';
import { parentIdOf, type Entity, type EntityKind, type EntityOf } from './entities';
import { DomainError } from './errors';
import type { JsonValue } from './json';

/** Records are JSON values, so a JSON round-trip is an exact deep copy (no DOM/Node globals). */
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * Minimal in-memory ReadContext for pure planner tests (no storage package involved).
 * Exported for tests in dependent packages; not used by production code.
 */
export class InMemoryContext implements ReadContext {
  readonly records = new Map<string, Entity>();
  constructor(readonly workspaceIds: Set<string> = new Set()) {}

  async hasWorkspace(id: string): Promise<boolean> {
    return this.workspaceIds.has(id);
  }
  async get<K extends EntityKind>(kind: K, id: string): Promise<EntityOf<K> | undefined> {
    const e = this.records.get(id);
    return e?.kind === kind ? (copy(e) as EntityOf<K>) : undefined;
  }
  async children<K extends EntityKind>(
    kind: K,
    workspaceId: string,
    parentId: string | null,
  ): Promise<EntityOf<K>[]> {
    return [...this.records.values()]
      .filter((e) => e.kind === kind && e.workspaceId === workspaceId && parentIdOf(e) === parentId)
      .map((e) => copy(e) as EntityOf<K>);
  }
  async byBatch(workspaceId: string, batchId: string): Promise<Entity[]> {
    return [...this.records.values()].filter(
      (e) => e.workspaceId === workspaceId && e.deleteBatchId === batchId,
    );
  }
  apply(mutation: Mutation): void {
    for (const c of mutation.changes) {
      if (c.after) this.records.set(c.id, copy(c.after));
      else this.records.delete(c.id);
    }
  }
}

/** Accepts any JSON object payload for a fixed set of types; useful for planner tests. */
export function permissiveCatalog(types: string[] = ['text']): BlockCatalog {
  const known = new Set(types);
  return {
    isKnown: (t) => known.has(t),
    currentVersion: () => 1,
    createDefault: () => ({ text: '' }),
    validate: (_t, payload) => {
      if (payload === null || typeof payload !== 'object')
        throw new DomainError('VALIDATION', 'error.block.invalid');
      return payload as JsonValue;
    },
    remapReferences: (_t, payload, map) => {
      const p = payload as { ref?: string };
      if (typeof p.ref === 'string' && map(p.ref))
        return { ...(payload as object), ref: map(p.ref) } as JsonValue;
      return payload;
    },
  };
}
