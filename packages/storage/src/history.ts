import {
  DomainError,
  jsonEqual,
  type Change,
  type Clock,
  type Entity,
  type EntityKind,
  type IdSource,
  type JsonValue,
} from '@panoya/domain';
import type { Transaction } from './backend';

/** Fields that change on every write and are not part of what a command "did". */
const META_FIELDS = new Set(['updatedAt', 'localRevision', 'remoteVersion']);

const childKinds: Record<EntityKind, readonly EntityKind[]> = {
  folder: ['folder', 'notebook'],
  notebook: ['page'],
  page: ['block'],
  block: [],
};

export function changedFields(before: Entity, after: Entity): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const b = before as unknown as Record<string, JsonValue>;
  const a = after as unknown as Record<string, JsonValue>;
  return [...keys].filter((k) => !META_FIELDS.has(k) && !jsonEqual(b[k] ?? null, a[k] ?? null));
}

/**
 * Computes the inverse of a logged set of changes against the *current* state (spec 04: undo is an
 * inverse command, not time travel). Field-level check: a change can be inverted only while the
 * fields it modified still hold the values it wrote; unrelated later edits (e.g. typing into a
 * moved block) do not block undo. Created records are removed when untouched, otherwise trashed
 * so nothing typed afterwards is lost.
 */
export async function invertChanges(
  tx: Transaction,
  changes: readonly Change[],
  env: { clock: Clock; ids: IdSource },
): Promise<Change[]> {
  const now = env.clock.now();
  const out = new Map<string, Change>();
  const current = async (kind: EntityKind, id: string) =>
    out.get(id)?.after ?? (await tx.get(kind, id));
  const record = (kind: EntityKind, before: Entity | null, after: Entity | null) => {
    const id = (after ?? before)?.id as string;
    const prior = out.get(id);
    out.set(id, { kind, id, before: prior ? prior.before : before, after });
  };
  let trashBatch: string | null = null;

  for (const change of [...changes].reverse()) {
    const now_ = await current(change.kind, change.id);

    if (change.before === null) {
      // Record was created by the command being inverted.
      if (!now_) continue;
      const children = await activeChildren(tx, change.kind, change.id);
      const untouched = change.after !== null && now_.localRevision === change.after.localRevision;
      if (untouched && children.length === 0) {
        record(change.kind, now_, null);
      } else if (now_.trashed === 0) {
        trashBatch ??= env.ids.newId();
        await trashSubtree(tx, change.kind, now_, trashBatch, now, record, current);
      }
      continue;
    }

    if (change.after === null) {
      // Record was removed by the command being inverted (undo of an undo-of-create): recreate it.
      if (now_) throw new DomainError('CONFLICT', 'error.undo.diverged');
      record(change.kind, null, {
        ...change.before,
        updatedAt: now,
        localRevision: change.before.localRevision + 1,
      });
      continue;
    }

    if (!now_) throw new DomainError('CONFLICT', 'error.undo.diverged');
    const fields = changedFields(change.before, change.after);
    const cur = now_ as unknown as Record<string, JsonValue>;
    const after = change.after as unknown as Record<string, JsonValue>;
    const before = change.before as unknown as Record<string, JsonValue>;
    if (fields.some((f) => !jsonEqual(cur[f] ?? null, after[f] ?? null))) {
      throw new DomainError('CONFLICT', 'error.undo.diverged');
    }
    const restored: Record<string, JsonValue> = { ...cur };
    for (const f of fields) restored[f] = before[f] ?? null;
    record(change.kind, now_, {
      ...(restored as unknown as Entity),
      updatedAt: now,
      localRevision: now_.localRevision + 1,
    });
  }
  return [...out.values()];
}

async function activeChildren(tx: Transaction, kind: EntityKind, id: string): Promise<Entity[]> {
  const workspaceProbe = await tx.get(kind, id);
  if (!workspaceProbe) return [];
  const result: Entity[] = [];
  for (const childKind of childKinds[kind]) {
    const children = await tx.children(childKind, workspaceProbe.workspaceId, id);
    result.push(...children.filter((c) => c.trashed === 0));
  }
  return result;
}

async function trashSubtree(
  tx: Transaction,
  kind: EntityKind,
  entity: Entity,
  batchId: string,
  now: string,
  record: (kind: EntityKind, before: Entity | null, after: Entity | null) => void,
  current: (kind: EntityKind, id: string) => Promise<Entity | undefined>,
): Promise<void> {
  const latest = (await current(kind, entity.id)) ?? entity;
  if (latest.trashed === 1) return;
  record(kind, latest, {
    ...latest,
    deletedAt: now,
    trashed: 1,
    deleteBatchId: batchId,
    updatedAt: now,
    localRevision: latest.localRevision + 1,
  });
  for (const child of await activeChildren(tx, kind, entity.id)) {
    await trashSubtree(tx, child.kind, child, batchId, now, record, current);
  }
}
