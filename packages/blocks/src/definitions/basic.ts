import { z } from 'zod';
import type { BlockDefinition } from '../registry';

export const headingSchema = z.object({
  text: z.string().max(500),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});
export type HeadingPayload = z.infer<typeof headingSchema>;

export const headingBlock: BlockDefinition<HeadingPayload> = {
  type: 'heading',
  currentVersion: 1,
  category: 'text',
  schema: headingSchema,
  createDefault: () => ({ text: '', level: 2 }),
  toPlainText: (p) => p.text,
  toMarkdown: (p) => `${'#'.repeat(p.level)} ${p.text}`,
};

export const dividerSchema = z.object({ style: z.enum(['line', 'space']) });
export type DividerPayload = z.infer<typeof dividerSchema>;

export const dividerBlock: BlockDefinition<DividerPayload> = {
  type: 'divider',
  currentVersion: 1,
  category: 'text',
  schema: dividerSchema,
  createDefault: () => ({ style: 'line' }),
  toPlainText: () => '---',
  toMarkdown: () => '---',
};

export const codeSchema = z.object({
  language: z.string().max(32),
  source: z.string().max(200_000),
});
export type CodePayload = z.infer<typeof codeSchema>;

/** Display/copy only; there is deliberately no execution (spec 06). */
export const codeBlock: BlockDefinition<CodePayload> = {
  type: 'code',
  currentVersion: 1,
  category: 'text',
  schema: codeSchema,
  createDefault: () => ({ language: '', source: '' }),
  toPlainText: (p) => p.source,
  toMarkdown: (p) => {
    const fence = p.source.includes('```') ? '~~~~' : '```';
    return `${fence}${p.language}\n${p.source}\n${fence}`;
  },
};

export const checklistSchema = z.object({
  items: z
    .array(
      z.object({ id: z.string().min(1).max(64), text: z.string().max(2000), checked: z.boolean() }),
    )
    .max(1000)
    .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
      message: 'duplicate item id',
    }),
});
export type ChecklistPayload = z.infer<typeof checklistSchema>;

export const checklistBlock: BlockDefinition<ChecklistPayload> = {
  type: 'checklist',
  currentVersion: 1,
  category: 'productivity',
  schema: checklistSchema,
  createDefault: () => ({ items: [] }),
  toPlainText: (p) => p.items.map((i) => `${i.checked ? '[x]' : '[ ]'} ${i.text}`).join('\n'),
  toMarkdown: (p) => p.items.map((i) => `- [${i.checked ? 'x' : ' '}] ${i.text}`).join('\n'),
};
