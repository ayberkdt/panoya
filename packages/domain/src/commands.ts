import { z } from 'zod';
import { idSchema, LIMITS } from './entities';

export const placementSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('start') }),
  z.object({ kind: z.literal('end') }),
  z.object({ kind: z.literal('before'), id: idSchema }),
  z.object({ kind: z.literal('after'), id: idSchema }),
]);
export type Placement = z.infer<typeof placementSchema>;

const containerKind = z.enum(['folder', 'notebook', 'page']);
const anyKind = z.enum(['folder', 'notebook', 'page', 'block']);
const name = z.string().trim().min(1).max(LIMITS.nameLength);
const pageTitle = z.string().trim().max(LIMITS.nameLength);
const ws = { workspaceId: idSchema };
const optionalId = idSchema.optional();
const defaultEnd = placementSchema.default({ kind: 'end' });

export const commandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('createFolder'),
    ...ws,
    id: optionalId,
    parentFolderId: idSchema.nullable(),
    name,
    placement: defaultEnd,
  }),
  z.object({
    type: z.literal('createNotebook'),
    ...ws,
    id: optionalId,
    folderId: idSchema.nullable(),
    title: name,
    icon: z.string().max(32).nullable().default(null),
    placement: defaultEnd,
  }),
  z.object({
    type: z.literal('createPage'),
    ...ws,
    id: optionalId,
    notebookId: idSchema,
    title: pageTitle,
    placement: defaultEnd,
    /** Initial blocks are created in the same transaction as the page. */
    blocks: z
      .array(z.object({ id: optionalId, type: z.string(), payload: z.unknown().optional() }))
      .max(200)
      .default([]),
  }),
  z.object({
    type: z.literal('rename'),
    ...ws,
    kind: containerKind,
    id: idSchema,
    name: pageTitle,
  }),
  z.object({
    type: z.literal('move'),
    ...ws,
    kind: anyKind,
    id: idSchema,
    /** Folder id (folder/notebook; null = root), notebook id (page) or page id (block). */
    parentId: idSchema.nullable(),
    placement: defaultEnd,
  }),
  z.object({
    type: z.literal('createBlock'),
    ...ws,
    id: optionalId,
    pageId: idSchema,
    blockType: z.string(),
    payload: z.unknown().optional(),
    placement: defaultEnd,
  }),
  z.object({
    type: z.literal('updateBlock'),
    ...ws,
    id: idSchema,
    payload: z.unknown(),
    /** Optimistic concurrency: the localRevision the editor started from. */
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal('setBlockCollapsed'), ...ws, id: idSchema, collapsed: z.boolean() }),
  z.object({ type: z.literal('duplicateBlock'), ...ws, id: idSchema }),
  z.object({ type: z.literal('duplicatePage'), ...ws, id: idSchema, title: pageTitle }),
  z.object({ type: z.literal('trash'), ...ws, kind: anyKind, id: idSchema }),
  z.object({
    type: z.literal('restore'),
    ...ws,
    batchId: idSchema,
    /** Required when the original parent is gone or itself in the trash. */
    targetParentId: idSchema.optional(),
  }),
  z.object({ type: z.literal('purge'), ...ws, batchId: idSchema }),
]);

export type DomainCommand = z.input<typeof commandSchema>;
export type ParsedCommand = z.output<typeof commandSchema>;
export type CommandType = ParsedCommand['type'];
export type CommandOf<T extends CommandType> = Extract<ParsedCommand, { type: T }>;

/** Commands that the global undo stack records (structural actions, not typing). */
export const undoableCommands: ReadonlySet<CommandType> = new Set<CommandType>([
  'createFolder',
  'createNotebook',
  'createPage',
  'rename',
  'move',
  'createBlock',
  'duplicateBlock',
  'duplicatePage',
  'trash',
  'restore',
]);
