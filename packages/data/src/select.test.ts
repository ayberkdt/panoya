import { describe, expect, it } from 'vitest';
import { convertCells, formatCell, parseCell } from './cells';
import { exportDataset } from './export';
import { buildImport, previewImport } from './importer';

const label = (i: number) => `Sütun ${i}`;
const select = {
  type: 'select' as const,
  currency: null,
  options: [
    { id: 'sent', label: 'Gönderildi', color: 'blue' as const },
    { id: 'neg', label: 'Olumsuz', color: 'red' as const },
  ],
};

describe('select / e-mail / url columns', () => {
  it('parses option labels case-insensitively (Turkish) and rejects unknown ones', () => {
    expect(parseCell('GÖNDERİLDİ', select, 'tr-TR')).toEqual({
      ok: true,
      value: { kind: 'select', optionId: 'sent' },
    });
    expect(parseCell('olumsuz', select, 'tr-TR')).toEqual({
      ok: true,
      value: { kind: 'select', optionId: 'neg' },
    });
    expect(parseCell('belki', select, 'tr-TR')).toEqual({ ok: false, reason: 'option' });
    expect(formatCell({ kind: 'select', optionId: 'neg' }, 'tr-TR', select)).toBe('Olumsuz');
  });

  it('validates e-mail and web addresses', () => {
    const email = { type: 'email' as const, currency: null };
    const url = { type: 'url' as const, currency: null };
    expect(parseCell('d.dirkx@example.invalid', email, 'tr-TR').ok).toBe(true);
    expect(parseCell('d.dirkx@', email, 'tr-TR')).toEqual({ ok: false, reason: 'email' });
    expect(parseCell('example.invalid/a?b=1', url, 'tr-TR')).toEqual({
      ok: true,
      value: { kind: 'text', value: 'https://example.invalid/a?b=1' },
    });
    expect(parseCell('javascript:alert(1)', url, 'tr-TR')).toEqual({ ok: false, reason: 'url' });
  });

  it('suggests select for repeated statuses and creates coloured options on import', () => {
    const csv = [
      'hoca;durum;eposta',
      'A;Atılmadı;a@example.invalid',
      'B;Gönderildi;b@example.invalid',
      'C;Atılmadı;c@example.invalid',
      'D;Olumsuz;d@example.invalid',
      'E;Atılmadı;e@example.invalid',
      '',
    ].join('\n');
    const preview = previewImport(csv, { emptyLabel: label, locale: 'tr-TR' });
    expect(preview.suggestedTypes).toEqual(['text', 'select', 'email']);
    const plan = buildImport(
      preview,
      preview.headers.map((h, i) => ({
        label: h,
        type: preview.suggestedTypes[i]!,
        currency: null,
      })),
      'tr-TR',
      (i) => `c${i}`,
    );
    expect(plan.problems).toEqual([]);
    expect(plan.columns[1]!.options?.map((o) => o.label)).toEqual([
      'Atılmadı',
      'Gönderildi',
      'Olumsuz',
    ]);
    expect(new Set(plan.columns[1]!.options?.map((o) => o.color)).size).toBe(3);
  });

  it('converting text to select derives options from the values', () => {
    const r = convertCells(
      [
        { id: 'a', cell: { kind: 'text', value: 'Onaylandı' } },
        { id: 'b', cell: { kind: 'text', value: 'onaylandı' } },
        { id: 'c', cell: { kind: 'text', value: 'Red' } },
      ],
      { type: 'select', currency: null, options: [] },
      'tr-TR',
    );
    expect(r.options?.map((o) => o.label)).toEqual(['Onaylandı', 'Red']);
    expect(r.values.a).toEqual(r.values.b);
    expect(r.invalid).toEqual([]);
  });

  it('exports select labels (neutralized when formula-like)', () => {
    const columns = [
      {
        id: 's',
        label: 'Durum',
        type: 'select' as const,
        unit: null,
        currency: null,
        options: [{ id: 'x', label: '=Tehlikeli', color: 'gray' as const }],
      },
    ];
    const rows = [{ id: 'r', cells: { s: { kind: 'select' as const, optionId: 'x' } } }] as never;
    expect(exportDataset(columns, rows).text).toBe("Durum\r\n'=Tehlikeli");
  });
});
