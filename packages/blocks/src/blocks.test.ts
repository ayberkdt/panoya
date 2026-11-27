import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from './index';
import {
  buildMailto,
  findPlaceholders,
  looksLikeEmail,
  mailAllText,
  type MailDraftPayload,
} from './definitions/productivity';
import { docFromText, richTextToMarkdown, richTextToPlain } from './definitions/richText';
import { pageToPlainText } from './serialize';
import { checkUrl, titleFromUrl } from './urls';
import type { Block } from '@panoya/domain';

const registry = createDefaultRegistry();

describe('registry contract', () => {
  it('every registered type has a valid default and serializers', () => {
    for (const def of registry.list()) {
      const payload = def.createDefault();
      expect(def.schema.safeParse(payload).success, def.type).toBe(true);
      expect(typeof def.toPlainText(payload)).toBe('string');
      expect(typeof def.toMarkdown(payload)).toBe('string');
      expect(
        registry.resolve({
          type: def.type,
          payload: payload as never,
          payloadVersion: def.currentVersion,
        }).status,
      ).toBe('ok');
    }
  });

  it('preserves unknown and future-version blocks read-only with text fallback', () => {
    const raw = { label: 'Gizli alan', nested: [{ value: 'iç metin' }], n: 4 };
    const unknown = registry.resolve({ type: 'futureWidget', payload: raw, payloadVersion: 1 });
    expect(unknown).toMatchObject({ status: 'unknown', reason: 'unknownType', raw });
    const future = registry.resolve({ type: 'link', payload: raw, payloadVersion: 99 });
    expect(future).toMatchObject({ status: 'unknown', reason: 'futureVersion' });
    expect(registry.plainText({ type: 'futureWidget', payload: raw, payloadVersion: 1 })).toBe(
      'Gizli alan\niç metin',
    );
  });

  it('marks invalid payloads as invalid instead of coercing them', () => {
    const resolved = registry.resolve({
      type: 'link',
      payload: { url: 'javascript:alert(1)' },
      payloadVersion: 1,
    });
    expect(resolved.status).toBe('invalid');
  });
});

describe('urls', () => {
  it('keeps query and fragment exactly', () => {
    const url = 'https://example.invalid/attendance?course=demo&t=Ab%2F9#form';
    expect(checkUrl(url)).toEqual({
      ok: true,
      href: url,
      host: 'example.invalid',
      scheme: 'https',
    });
  });

  it.each([
    ['javascript:alert(1)', 'scheme'],
    ['JaVaScRiPt:alert(1)', 'scheme'],
    ['data:text/html,<script>1</script>', 'scheme'],
    ['file:///etc/passwd', 'scheme'],
    ['https://user:pass@example.invalid/', 'credentials'],
    ['https://exa mple.invalid', 'malformed'],
    ['java\tscript:alert(1)', 'malformed'],
    ['', 'empty'],
  ])('rejects %s', (input, problem) => {
    expect(checkUrl(input)).toEqual({ ok: false, problem });
  });

  it('adds https to bare hosts and derives titles', () => {
    expect(checkUrl('example.invalid/materials')).toMatchObject({
      ok: true,
      href: 'https://example.invalid/materials',
    });
    expect(titleFromUrl('https://www.example.invalid/x')).toBe('example.invalid');
    expect(checkUrl('mailto:a@example.invalid')).toEqual({ ok: false, problem: 'scheme' });
    expect(checkUrl('mailto:a@example.invalid', { allowMailto: true }).ok).toBe(true);
  });

  it('link schema refuses unsafe urls but allows an empty draft', () => {
    expect(() =>
      registry.validate('link', {
        title: '',
        url: 'javascript:x',
        description: '',
        category: '',
        tags: [],
      }),
    ).toThrow();
    expect(
      registry.validate('link', { title: '', url: '', description: '', category: '', tags: [] }),
    ).toBeTruthy();
  });
});

describe('mail draft', () => {
  // Spec 23 fixture: exact body, newline after the first paragraph, no implicit signature.
  const body =
    'Hocam merhaba,\n\nHazırladığım örnek belgeleri ekte paylaşıyorum.\n\nDesteğiniz için teşekkür ederim.\n\nSaygılarımla,';
  const draft: MailDraftPayload = {
    title: 'Proje desteği',
    to: ['demo@example.invalid'],
    cc: [],
    bcc: [],
    subject: 'Proje desteği hakkında',
    body: { format: 'plain', text: body },
    language: 'tr',
  };

  it('round-trips the body byte-for-byte through validation', () => {
    const valid = registry.validate('mailDraft', draft) as MailDraftPayload;
    expect(valid.body.text).toBe(body);
    expect(valid.subject).not.toContain('Hocam');
  });

  it('copy-all puts headers before the untouched body', () => {
    const text = mailAllText(draft, { to: 'Kime', cc: 'Bilgi', bcc: 'Gizli', subject: 'Konu' });
    expect(text).toBe(`Kime: demo@example.invalid\nKonu: Proje desteği hakkında\n\n${body}`);
  });

  it('encodes mailto components and CRLF line breaks', () => {
    const url = buildMailto(draft);
    expect(
      url.startsWith(
        'mailto:demo%40example.invalid?subject=Proje%20deste%C4%9Fi%20hakk%C4%B1nda&body=',
      ),
    ).toBe(true);
    expect(url).toContain('%0D%0A%0D%0A');
  });

  it('finds placeholders and checks addresses loosely', () => {
    expect(findPlaceholders('Sayın {{hoca}}, [Ders adı] hakkında')).toEqual([
      '{{hoca}}',
      '[Ders adı]',
    ]);
    expect(looksLikeEmail('Ayşe <ayse@example.invalid>')).toBe(true);
    expect(looksLikeEmail('Ayşe Hoca')).toBe(false);
  });
});

describe('rich text', () => {
  it('converts text to a doc and back preserving blank lines and Turkish letters', () => {
    const text = 'İlk satır ğüşıöç\n\nÜçüncü';
    expect(richTextToPlain(docFromText(text))).toBe(text);
  });

  it('serializes lists and marks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Başlık' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'bir', marks: [{ type: 'bold' }] }],
                },
              ],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'iki' }] }],
            },
          ],
        },
      ],
    };
    expect(richTextToPlain(doc)).toBe('Başlık\n- bir\n- iki');
    expect(richTextToMarkdown(doc)).toBe('## Başlık\n\n- **bir**\n- iki');
  });

  it('rejects unknown nodes and unsafe link marks', () => {
    const bad = (doc: unknown) =>
      registry.resolve({ type: 'richText', payload: { doc } as never, payloadVersion: 1 }).status;
    expect(bad({ type: 'doc', content: [{ type: 'iframe' }] })).toBe('invalid');
    expect(
      bad({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'x',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
        ],
      }),
    ).toBe('invalid');
  });
});

describe('page serialization', () => {
  it('copies blocks in rank order, not insertion order', () => {
    const mk = (id: string, rank: string, text: string): Block => ({
      id,
      workspaceId: 'w',
      pageId: 'p',
      kind: 'block',
      type: 'quickCopy',
      payloadVersion: 1,
      payload: { title: '', text, format: 'plain' },
      rank,
      collapsed: false,
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      trashed: 0,
      deleteBatchId: null,
      schemaVersion: 1,
      localRevision: 1,
      remoteVersion: null,
    });
    const text = pageToPlainText(registry, 'Sayfa', [
      mk('2', 'a2', 'ikinci'),
      mk('1', 'a1', 'birinci'),
      mk('3', 'a3', ''),
    ]);
    expect(text).toBe('Sayfa\n\nbirinci\n\nikinci');
  });
});
