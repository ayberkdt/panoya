import { z } from 'zod';
import type { BlockDefinition } from '../registry';
import { checkUrl, titleFromUrl } from '../urls';

// ------------------------------------------------------------------------------------------- link

/** Empty URL is allowed for a link that is still being written; any non-empty URL must be safe. */
const linkUrl = z
  .string()
  .max(8192)
  .refine((u) => u === '' || checkUrl(u).ok, { message: 'unsafe or malformed url' });

export const linkSchema = z.object({
  title: z.string().max(300),
  url: linkUrl,
  description: z.string().max(5000),
  category: z.string().max(100),
  tags: z.array(z.string().min(1).max(50)).max(30),
});
export type LinkPayload = z.infer<typeof linkSchema>;

export function linkDisplayTitle(p: LinkPayload): string {
  return p.title.trim() || titleFromUrl(p.url) || p.url;
}

export const linkBlock: BlockDefinition<LinkPayload> = {
  type: 'link',
  currentVersion: 1,
  category: 'productivity',
  schema: linkSchema,
  createDefault: () => ({ title: '', url: '', description: '', category: '', tags: [] }),
  toPlainText: (p) =>
    [linkDisplayTitle(p), p.url, p.description].filter((s) => s.trim() !== '').join('\n'),
  toMarkdown: (p) => {
    const title = linkDisplayTitle(p).replace(/[[\]]/g, '\\$&');
    const line = p.url ? `[${title}](${p.url})` : title;
    return p.description ? `${line}\n\n${p.description}` : line;
  },
};

// -------------------------------------------------------------------------------------- quickCopy

export const quickCopySchema = z.object({
  title: z.string().max(300),
  text: z.string().max(200_000),
  format: z.enum(['plain', 'markdown']),
});
export type QuickCopyPayload = z.infer<typeof quickCopySchema>;

export const quickCopyBlock: BlockDefinition<QuickCopyPayload> = {
  type: 'quickCopy',
  currentVersion: 1,
  category: 'productivity',
  schema: quickCopySchema,
  createDefault: () => ({ title: '', text: '', format: 'plain' }),
  toPlainText: (p) => p.text,
  toMarkdown: (p) => (p.title ? `**${p.title}**\n\n${p.text}` : p.text),
};

// -------------------------------------------------------------------------------------- mailDraft

const recipient = z.string().trim().min(1).max(320);

export const mailDraftSchema = z.object({
  title: z.string().max(300),
  to: z.array(recipient).max(100),
  cc: z.array(recipient).max(100),
  bcc: z.array(recipient).max(100),
  subject: z.string().max(1000),
  /** One canonical body representation (discriminated union); rich bodies may be added later. */
  body: z.discriminatedUnion('format', [
    z.object({ format: z.literal('plain'), text: z.string().max(200_000) }),
  ]),
  language: z.enum(['tr', 'en']),
});
export type MailDraftPayload = z.infer<typeof mailDraftSchema>;

/** Loose e-mail check used only to warn; raw names are allowed (spec 08). */
export function looksLikeEmail(value: string): boolean {
  const match = /<([^<>]+)>\s*$/.exec(value);
  const address = (match?.[1] ?? value).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(address);
}

/** Placeholders such as {{isim}} or [Ad Soyad] that should be filled before sending. */
export function findPlaceholders(text: string): string[] {
  const found = text.match(/\{\{[^{}\n]{1,60}\}\}|\[[^[\]\n]{1,60}\]/g) ?? [];
  return [...new Set(found)];
}

export function mailBodyText(p: MailDraftPayload): string {
  return p.body.text;
}

/** "Copy all" text with explicit headers; body is reproduced byte-for-byte. */
export function mailAllText(
  p: MailDraftPayload,
  labels: { to: string; cc: string; bcc: string; subject: string },
): string {
  const header: string[] = [];
  if (p.to.length) header.push(`${labels.to}: ${p.to.join(', ')}`);
  if (p.cc.length) header.push(`${labels.cc}: ${p.cc.join(', ')}`);
  if (p.bcc.length) header.push(`${labels.bcc}: ${p.bcc.join(', ')}`);
  header.push(`${labels.subject}: ${p.subject}`);
  return `${header.join('\n')}\n\n${p.body.text}`;
}

/** mailto: URL that only opens the local mail client; components are percent-encoded. */
export function buildMailto(p: MailDraftPayload): string {
  const params: string[] = [];
  if (p.cc.length) params.push(`cc=${encodeURIComponent(p.cc.join(','))}`);
  if (p.bcc.length) params.push(`bcc=${encodeURIComponent(p.bcc.join(','))}`);
  if (p.subject) params.push(`subject=${encodeURIComponent(p.subject)}`);
  if (p.body.text) params.push(`body=${encodeURIComponent(p.body.text.replace(/\r?\n/g, '\r\n'))}`);
  const to = p.to.map((r) => encodeURIComponent(r)).join(',');
  return `mailto:${to}${params.length ? `?${params.join('&')}` : ''}`;
}

/** Many clients truncate long mailto URLs; above this the UI recommends copying instead. */
export const MAILTO_SAFE_LENGTH = 1800;

export const mailDraftBlock: BlockDefinition<MailDraftPayload> = {
  type: 'mailDraft',
  currentVersion: 1,
  category: 'productivity',
  schema: mailDraftSchema,
  createDefault: () => ({
    title: '',
    to: [],
    cc: [],
    bcc: [],
    subject: '',
    body: { format: 'plain', text: '' },
    language: 'tr',
  }),
  toPlainText: (p) => [p.title, p.subject, p.body.text].filter((s) => s.trim() !== '').join('\n'),
  toMarkdown: (p) => {
    const lines = [`**${p.subject || p.title}**`];
    if (p.to.length) lines.push(`To: ${p.to.join(', ')}`);
    return `${lines.join('  \n')}\n\n${p.body.text}`;
  },
};
