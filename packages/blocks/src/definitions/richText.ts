import { z } from 'zod';
import type { BlockDefinition } from '../registry';
import { isSafeUrl } from '../urls';

/**
 * Rich text payload: a ProseMirror/Tiptap JSON document (ADR-001). Only an allowlisted subset of
 * node and mark types is accepted; anything else makes the payload "invalid", which the registry
 * preserves read-only instead of silently truncating it.
 */
export interface RichTextMark {
  type: string;
  attrs?: Record<string, string | number | boolean | null>;
}
export interface RichTextNode {
  type: string;
  attrs?: Record<string, string | number | boolean | null>;
  content?: RichTextNode[];
  text?: string;
  marks?: RichTextMark[];
}
export interface RichTextPayload {
  doc: RichTextNode;
}

export const RICH_TEXT_NODES = [
  'doc',
  'paragraph',
  'text',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
] as const;
export const RICH_TEXT_MARKS = ['bold', 'italic', 'strike', 'code', 'link', 'underline'] as const;

const attrValue = z.union([z.string().max(2048), z.number(), z.boolean(), z.null()]);
const attrs = z.record(z.string().max(64), attrValue);

const markSchema: z.ZodType<RichTextMark> = z
  .object({ type: z.enum(RICH_TEXT_MARKS), attrs: attrs.optional() })
  .refine(
    (m) =>
      m.type !== 'link' ||
      (typeof m.attrs?.href === 'string' && isSafeUrl(m.attrs.href, { allowMailto: true })),
    {
      message: 'unsafe link href',
    },
  );

const nodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.object({
    type: z.enum(RICH_TEXT_NODES),
    attrs: attrs.optional(),
    content: z.array(nodeSchema).max(10_000).optional(),
    text: z.string().max(200_000).optional(),
    marks: z.array(markSchema).max(16).optional(),
  }),
);

export const richTextSchema = z.object({
  doc: nodeSchema.refine((n) => n.type === 'doc', { message: 'root must be doc' }),
});

export function emptyDoc(): RichTextNode {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function docFromText(text: string): RichTextNode {
  const paragraphs = text.split(/\r?\n/);
  return {
    type: 'doc',
    content: paragraphs.map((line) =>
      line === ''
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: [{ type: 'text', text: line }] },
    ),
  };
}

function inlineText(node: RichTextNode): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(inlineText).join('');
}

/** Plain text with one line per paragraph, list markers and blank lines between blocks. */
export function richTextToPlain(doc: RichTextNode): string {
  const lines: string[] = [];
  const walk = (node: RichTextNode, indent: string, marker: string | null) => {
    switch (node.type) {
      case 'doc':
      case 'blockquote':
        (node.content ?? []).forEach((child) =>
          walk(child, node.type === 'blockquote' ? `${indent}> ` : indent, null),
        );
        break;
      case 'bulletList':
        (node.content ?? []).forEach((child) => walk(child, indent, '- '));
        break;
      case 'orderedList': {
        const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
        (node.content ?? []).forEach((child, i) => walk(child, indent, `${start + i}. `));
        break;
      }
      case 'listItem':
        (node.content ?? []).forEach((child, i) =>
          walk(child, i === 0 ? indent : `${indent}   `, i === 0 ? marker : null),
        );
        break;
      case 'horizontalRule':
        lines.push(`${indent}---`);
        break;
      case 'codeBlock':
        lines.push(
          ...inlineText(node)
            .split('\n')
            .map((l) => indent + l),
        );
        break;
      default:
        lines.push(indent + (marker ?? '') + inlineText(node));
    }
  };
  walk(doc, '', null);
  return lines.join('\n');
}

function markdownInline(node: RichTextNode): string {
  if (node.type === 'hardBreak') return '  \n';
  if (node.type !== 'text') return (node.content ?? []).map(markdownInline).join('');
  let text = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') text = `**${text}**`;
    else if (mark.type === 'italic') text = `*${text}*`;
    else if (mark.type === 'strike') text = `~~${text}~~`;
    else if (mark.type === 'code') text = `\`${text}\``;
    else if (mark.type === 'link' && typeof mark.attrs?.href === 'string')
      text = `[${text}](${mark.attrs.href})`;
  }
  return text;
}

export function richTextToMarkdown(doc: RichTextNode): string {
  const out: string[] = [];
  const walk = (node: RichTextNode, prefix: string) => {
    switch (node.type) {
      case 'doc':
        (node.content ?? []).forEach((c) => walk(c, prefix));
        break;
      case 'heading': {
        const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 1;
        out.push(
          `${prefix}${'#'.repeat(Math.min(Math.max(level, 1), 6))} ${markdownInline(node)}`,
          '',
        );
        break;
      }
      case 'blockquote':
        (node.content ?? []).forEach((c) => walk(c, `${prefix}> `));
        break;
      case 'bulletList':
      case 'orderedList':
        (node.content ?? []).forEach((item, i) => {
          const marker = node.type === 'bulletList' ? '- ' : `${i + 1}. `;
          const [first, ...rest] = item.content ?? [];
          out.push(`${prefix}${marker}${first ? markdownInline(first) : ''}`);
          rest.forEach((c) => walk(c, `${prefix}   `));
        });
        out.push('');
        break;
      case 'codeBlock': {
        const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
        out.push(
          `${prefix}\`\`\`${lang}`,
          ...inlineText(node)
            .split('\n')
            .map((l) => prefix + l),
          `${prefix}\`\`\``,
          '',
        );
        break;
      }
      case 'horizontalRule':
        out.push(`${prefix}---`, '');
        break;
      default:
        out.push(prefix + markdownInline(node), '');
    }
  };
  walk(doc, '');
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export const richTextBlock: BlockDefinition<RichTextPayload> = {
  type: 'richText',
  currentVersion: 1,
  category: 'text',
  schema: richTextSchema,
  createDefault: () => ({ doc: emptyDoc() }),
  toPlainText: (p) => richTextToPlain(p.doc),
  toMarkdown: (p) => richTextToMarkdown(p.doc),
};
