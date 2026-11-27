import { z } from 'zod';
import {
  cellValueSchema,
  columnsValid,
  DATASET_LIMITS,
  datasetColumnSchema,
  datasetSourceSchema,
  rowHistoryEntrySchema,
} from './dataset';
import { DomainError } from './errors';
import { isValidRank } from './rank';

/** Current on-disk schema version of every entity record. Bump with a migration (see storage). */
export const ENTITY_SCHEMA_VERSION = 1 as const;

export const LIMITS = {
  nameLength: 200,
  /** Serialized JSON size of a single block payload. */
  blockPayloadBytes: 512 * 1024,
  folderDepth: 16,
  /** Maximum number of entities one command may touch (subtree trash/duplicate, dataset import). */
  batchSize: 25_000,
} as const;

export const idSchema = z.uuid();
export const isoDateTimeSchema = z.iso.datetime({ offset: false });

export const entityKinds = [
  'folder',
  'notebook',
  'page',
  'block',
  'dataset',
  'datasetRow',
] as const;
export type EntityKind = (typeof entityKinds)[number];

export const localeSchema = z.enum(['tr-TR', 'en-US']);
export type Locale = z.infer<typeof localeSchema>;

const rankSchema = z.string().refine(isValidRank, 'invalid rank');
const nameSchema = z.string().max(LIMITS.nameLength);

const baseShape = {
  id: idSchema,
  workspaceId: idSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  /** Soft delete marker. `trashed` mirrors it as 0/1 because IndexedDB cannot index null. */
  deletedAt: isoDateTimeSchema.nullable(),
  trashed: z.union([z.literal(0), z.literal(1)]),
  /** Id of the command batch that trashed this record; restore only brings back that batch. */
  deleteBatchId: idSchema.nullable(),
  schemaVersion: z.literal(ENTITY_SCHEMA_VERSION),
  localRevision: z.number().int().nonnegative(),
  remoteVersion: z.number().int().nonnegative().nullable(),
};

function trashConsistent(v: {
  deletedAt: string | null;
  trashed: 0 | 1;
  deleteBatchId: string | null;
}) {
  return v.deletedAt === null
    ? v.trashed === 0 && v.deleteBatchId === null
    : v.trashed === 1 && v.deleteBatchId !== null;
}
const trashMessage = { message: 'deletedAt, trashed and deleteBatchId disagree' };

export const workspaceSchema = z.object({
  id: idSchema,
  name: nameSchema.min(1),
  locale: localeSchema,
  baseCurrency: z.string().regex(/^[A-Z]{3}$/),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  schemaVersion: z.literal(ENTITY_SCHEMA_VERSION),
  localRevision: z.number().int().nonnegative(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const folderSchema = z
  .object({
    ...baseShape,
    kind: z.literal('folder'),
    parentFolderId: idSchema.nullable(),
    name: nameSchema.min(1),
    rank: rankSchema,
  })
  .refine(trashConsistent, trashMessage);
export type Folder = z.infer<typeof folderSchema>;

export const notebookSchema = z
  .object({
    ...baseShape,
    kind: z.literal('notebook'),
    folderId: idSchema.nullable(),
    title: nameSchema.min(1),
    icon: z.string().max(32).nullable(),
    rank: rankSchema,
  })
  .refine(trashConsistent, trashMessage);
export type Notebook = z.infer<typeof notebookSchema>;

export const pageSchema = z
  .object({
    ...baseShape,
    kind: z.literal('page'),
    notebookId: idSchema,
    title: nameSchema,
    rank: rankSchema,
    archivedAt: isoDateTimeSchema.nullable(),
    templateId: idSchema.nullable(),
  })
  .refine(trashConsistent, trashMessage);
export type Page = z.infer<typeof pageSchema>;

export const blockSchema = z
  .object({
    ...baseShape,
    kind: z.literal('block'),
    pageId: idSchema,
    type: z.string().regex(/^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)*$/),
    payloadVersion: z.number().int().positive(),
    /** Validated by the block registry, not here; unknown types are preserved verbatim. */
    payload: z.json(),
    rank: rankSchema,
    collapsed: z.boolean(),
  })
  .refine(trashConsistent, trashMessage);
export type Block = z.infer<typeof blockSchema>;

/** Typed table data (spec 10). Lives at workspace level; blocks reference it by id. */
export const datasetSchema = z
  .object({
    ...baseShape,
    kind: z.literal('dataset'),
    title: nameSchema,
    columns: z.array(datasetColumnSchema).refine(columnsValid, 'invalid columns'),
    source: datasetSourceSchema,
    /** Increments on every committed data change (rows or schema); keys derived caches. */
    dataRevision: z.number().int().nonnegative(),
  })
  .refine(trashConsistent, trashMessage);
export type Dataset = z.infer<typeof datasetSchema>;

export const datasetRowSchema = z
  .object({
    ...baseShape,
    kind: z.literal('datasetRow'),
    datasetId: idSchema,
    rank: rankSchema,
    /** Keyed by column id; absent key = missing. */
    cells: z.record(z.string(), cellValueSchema),
    /** Change history of tracked columns, oldest first (capped). */
    history: z.array(rowHistoryEntrySchema).max(DATASET_LIMITS.historyPerRow).optional(),
  })
  .refine(trashConsistent, trashMessage);
export type DatasetRow = z.infer<typeof datasetRowSchema>;

export type Entity = Folder | Notebook | Page | Block | Dataset | DatasetRow;
export type EntityOf<K extends EntityKind> = Extract<Entity, { kind: K }>;

export const entitySchemas = {
  folder: folderSchema,
  notebook: notebookSchema,
  page: pageSchema,
  block: blockSchema,
  dataset: datasetSchema,
  datasetRow: datasetRowSchema,
} as const satisfies Record<EntityKind, z.ZodType>;

/** Name of the field that points at the parent record, per kind. */
export const parentField = {
  folder: 'parentFolderId',
  notebook: 'folderId',
  page: 'notebookId',
  block: 'pageId',
  dataset: null,
  datasetRow: 'datasetId',
} as const satisfies Record<EntityKind, string | null>;

export function parentIdOf(entity: Entity): string | null {
  switch (entity.kind) {
    case 'folder':
      return entity.parentFolderId;
    case 'notebook':
      return entity.folderId;
    case 'page':
      return entity.notebookId;
    case 'block':
      return entity.pageId;
    case 'dataset':
      return null;
    case 'datasetRow':
      return entity.datasetId;
  }
}

export function displayNameOf(entity: Folder | Notebook | Page): string {
  return entity.kind === 'folder' ? entity.name : entity.title;
}

export function isActive(entity: { trashed: 0 | 1 }): boolean {
  return entity.trashed === 0;
}

/** Validates a record read from storage or an import; throws a VALIDATION DomainError. */
export function validateEntity(entity: unknown): Entity {
  const kind = (entity as { kind?: unknown } | null)?.kind;
  if (typeof kind === 'string' && (entityKinds as readonly string[]).includes(kind)) {
    const result = entitySchemas[kind as EntityKind].safeParse(entity);
    if (result.success) return result.data;
    throw new DomainError('VALIDATION', 'error.entity.invalid', {
      details: { kind, path: result.error.issues[0]?.path.join('.') ?? '' },
    });
  }
  throw new DomainError('VALIDATION', 'error.entity.unknownKind');
}
