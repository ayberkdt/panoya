import { ENTITY_SCHEMA_VERSION, DomainError } from '@panoya/domain';

/**
 * Record-level migrations, applied lazily on read and written back on the next update. Each step
 * is pure and never drops unknown fields' information silently; records from a newer app version
 * are refused instead of being "downgraded".
 *
 * v0 → v1: pre-release records had no `trashed`/`deleteBatchId` and used `deleted: boolean`.
 */
type Raw = Record<string, unknown>;

const entitySteps: Record<number, (raw: Raw) => Raw> = {
  0: (raw) => {
    const { deleted, ...rest } = raw;
    const deletedAt = typeof rest.deletedAt === 'string' ? rest.deletedAt : null;
    const isDeleted = deleted === true || deletedAt !== null;
    return {
      ...rest,
      deletedAt: isDeleted ? (deletedAt ?? (rest.updatedAt as string)) : null,
      trashed: isDeleted ? 1 : 0,
      // Legacy deletions have no batch; give each its own synthetic batch so it can be restored.
      deleteBatchId: isDeleted ? (rest.id as string) : null,
      remoteVersion: rest.remoteVersion ?? null,
      schemaVersion: 1,
    };
  },
};

export function migrateEntity(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  let raw = input as Raw;
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version > ENTITY_SCHEMA_VERSION) {
    throw new DomainError('UNSUPPORTED', 'error.storage.newerSchema', { details: { version } });
  }
  while (version < ENTITY_SCHEMA_VERSION) {
    const step = entitySteps[version];
    if (!step)
      throw new DomainError('STORAGE', 'error.storage.migrationMissing', { details: { version } });
    raw = step(raw);
    version = raw.schemaVersion as number;
  }
  return raw;
}

export function migrateWorkspace(input: unknown): unknown {
  if (input === null || typeof input !== 'object') return input;
  const raw = input as Raw;
  if (typeof raw.schemaVersion !== 'number' || raw.schemaVersion === 0) {
    return { localRevision: 1, ...raw, schemaVersion: 1 };
  }
  return raw;
}
