import { z } from 'zod';
import type { BlockDefinition } from '../registry';

/**
 * Data table block (spec 10): references a Dataset; rows live in DatasetRow records, never in the
 * payload. Sort is view state only and never changes the stored data or analytics.
 */
export const tableSchema = z.object({
  datasetId: z.uuid(),
  view: z.object({
    sort: z
      .object({ columnId: z.string().min(1).max(40), direction: z.enum(['asc', 'desc']) })
      .nullable(),
    /** Show only rows with one choice of a select column (null optionId = empty choice). */
    filter: z
      .object({
        columnId: z.string().min(1).max(40),
        optionId: z.string().min(1).max(40).nullable(),
      })
      .nullable()
      .optional(),
  }),
});
export type TablePayload = z.infer<typeof tableSchema>;

export const tableBlock: BlockDefinition<TablePayload> = {
  type: 'table',
  currentVersion: 1,
  category: 'data',
  schema: tableSchema,
  // Tables are created with their dataset through `createTableBlock`; this default is never stored.
  createDefault: () => ({
    datasetId: '00000000-0000-4000-8000-000000000000',
    view: { sort: null },
  }),
  toPlainText: () => '',
  toMarkdown: () => '',
  datasetRefs: (p) => [p.datasetId],
  remapReferences: (p, map) => ({ ...p, datasetId: map(p.datasetId) ?? p.datasetId }),
};
