import { describe, expect, it } from 'vitest';
import type { DatasetColumn, DatasetRow } from '@panoya/domain';
import {
  convertCells,
  detectNumberLocale,
  formatCell,
  inferColumnType,
  parseCell,
  parseLocaleDate,
  parseLocaleDecimal,
} from './cells';
import {
  CsvError,
  detectDelimiter,
  neutralizeFormula,
  normalizeHeaders,
  parseDelimited,
} from './csv';
import { exportDataset } from './export';
import { buildImport, previewImport } from './importer';

// Spec 23 data fixture.
const FIXTURE = 'x;y;label\n1;2;bir\n2;4;iki\n3;6;üç\n4;;eksik y\n5;10;beş\n;12;eksik x\n';
const label = (i: number) => `Sütun ${i}`;

describe('CSV parser', () => {
  it('detects the delimiter and keeps empty cells as empty strings', () => {
    expect(detectDelimiter(FIXTURE)).toBe(';');
    const { rows } = parseDelimited(FIXTURE);
    expect(rows).toHaveLength(7);
    expect(rows[4]).toEqual(['4', '', 'eksik y']);
    expect(rows[6]).toEqual(['', '12', 'eksik x']);
  });

  it('handles BOM, CRLF, quotes, escaped quotes and multiline cells', () => {
    const text = '﻿ad,not\r\n"Ayşe ""A""","satır 1\r\nsatır 2"\r\nÇağrı,"a,b"\r\n';
    const { rows, delimiter } = parseDelimited(text);
    expect(delimiter).toBe(',');
    expect(rows).toEqual([
      ['ad', 'not'],
      ['Ayşe "A"', 'satır 1\r\nsatır 2'],
      ['Çağrı', 'a,b'],
    ]);
  });

  it('detects tabs and reports ragged rows', () => {
    const r = parseDelimited('a\tb\tc\n1\t2\n');
    expect(r.delimiter).toBe('\t');
    expect(r.raggedRows).toEqual([2]);
  });

  it('fails clearly on an unterminated quote and on empty input', () => {
    expect(() => parseDelimited('a,b\n"open,1\n2,3')).toThrow(CsvError);
    expect(() => parseDelimited('')).toThrow(CsvError);
  });

  it('disambiguates duplicate and empty headers', () => {
    expect(normalizeHeaders(['x', 'X', '', 'x'], label)).toEqual([
      'x',
      'X (2)',
      'Sütun 3',
      'x (3)',
    ]);
  });
});

describe('locale-aware numbers (never guessed)', () => {
  it('parses tr-TR and en-US explicitly', () => {
    expect(parseLocaleDecimal('1.234,56', 'tr-TR')).toBe('1234.56');
    expect(parseLocaleDecimal('1,234.56', 'en-US')).toBe('1234.56');
    expect(parseLocaleDecimal('1,5', 'tr-TR')).toBe('1.5');
    expect(parseLocaleDecimal('1,234', 'tr-TR')).toBe('1.234');
    expect(parseLocaleDecimal('1,234', 'en-US')).toBe('1234');
    expect(parseLocaleDecimal('-0012,50', 'tr-TR')).toBe('-12.5');
    expect(parseLocaleDecimal('0', 'tr-TR')).toBe('0');
    expect(parseLocaleDecimal('12.34.5', 'tr-TR')).toBeNull();
    expect(parseLocaleDecimal('1.23,4', 'tr-TR')).toBeNull(); // bad grouping
    expect(parseLocaleDecimal('abc', 'en-US')).toBeNull();
  });

  it('flags ambiguous samples so the user must choose', () => {
    expect(detectNumberLocale(['1,234', '5,678'])).toBe('ambiguous'); // 1.234 (tr) or 1234 (en)
    expect(detectNumberLocale(['1,234', '2,5'])).toBe('tr-TR'); // '2,5' is not valid en-US grouping
    expect(detectNumberLocale(['1.234,56', '10'])).toBe('tr-TR');
    expect(detectNumberLocale(['1,234.56'])).toBe('en-US');
    expect(detectNumberLocale(['10', '20'])).toBe('tr-TR'); // integers read the same either way
  });

  it('parses typed cells; empty is missing, 0 is a value', () => {
    const num = { type: 'number' as const, currency: null };
    expect(parseCell('', num, 'tr-TR')).toEqual({ ok: true, value: { kind: 'missing' } });
    expect(parseCell('0', num, 'tr-TR')).toEqual({ ok: true, value: { kind: 'number', value: 0 } });
    expect(parseCell('x', num, 'tr-TR')).toEqual({ ok: false, reason: 'number' });
    expect(parseCell('300 EUR', { type: 'money', currency: 'EUR' }, 'tr-TR')).toEqual({
      ok: true,
      value: { kind: 'money', amount: '300', currency: 'EUR' },
    });
    expect(parseCell('300 TRY', { type: 'money', currency: 'EUR' }, 'tr-TR')).toEqual({
      ok: false,
      reason: 'currency',
    });
    expect(parseCell('evet', { type: 'boolean', currency: null }, 'tr-TR')).toEqual({
      ok: true,
      value: { kind: 'boolean', value: true },
    });
    expect(parseLocaleDate('02.01.2026', 'tr-TR')).toBe('2026-01-02');
    expect(parseLocaleDate('01/02/2026', 'en-US')).toBe('2026-01-02');
    expect(parseLocaleDate('31.02.2026', 'tr-TR')).toBeNull();
  });

  it('suggests types and formats cells back in the locale', () => {
    expect(inferColumnType(['1', '2', '', '4'], 'tr-TR')).toBe('number');
    expect(inferColumnType(['2026-01-02', '2026-02-03'], 'tr-TR')).toBe('date');
    expect(inferColumnType(['bir', 'iki'], 'tr-TR')).toBe('text');
    expect(formatCell({ kind: 'decimal', value: '1234.5' }, 'tr-TR')).toBe('1234,5');
    expect(formatCell({ kind: 'number', value: 0 }, 'tr-TR')).toBe('0');
    expect(formatCell(undefined, 'tr-TR')).toBe('');
  });

  it('previews type conversions and lists rows that cannot convert', () => {
    const r = convertCells(
      [
        { id: 'a', cell: { kind: 'text', value: '12' } },
        { id: 'b', cell: { kind: 'text', value: 'on iki' } },
        { id: 'c', cell: undefined },
      ],
      { type: 'number', currency: null },
      'tr-TR',
    );
    expect(r.values).toEqual({ a: { kind: 'number', value: 12 } });
    expect(r.invalid).toEqual(['b']);
  });
});

describe('import pipeline (spec 23 fixture)', () => {
  it('previews, then builds typed rows with missing values and no problems', () => {
    const preview = previewImport(FIXTURE, { emptyLabel: label, locale: 'tr-TR' });
    expect(preview.headers).toEqual(['x', 'y', 'label']);
    expect(preview.suggestedTypes).toEqual(['number', 'number', 'text']);
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
    const xs = plan.rows.map((r) => r.cells.c0);
    expect(xs.filter((c) => c !== undefined)).toHaveLength(5); // valid x n = 5
    expect(plan.rows[5]!.cells.c0).toBeUndefined(); // "eksik x" stays missing
    expect(plan.rows[2]!.cells.c2).toEqual({ kind: 'text', value: 'üç' });
  });

  it('reports invalid values instead of coercing them', () => {
    const preview = previewImport('n\n1\nabc\n', { emptyLabel: label, locale: 'tr-TR' });
    const plan = buildImport(
      preview,
      [{ label: 'n', type: 'number', currency: null }],
      'tr-TR',
      () => 'n',
    );
    expect(plan.problems).toEqual([{ row: 1, column: 0, reason: 'number', raw: 'abc' }]);
  });

  it('imports "1.234,56" correctly with tr-TR', () => {
    const preview = previewImport('tutar\n"1.234,56"\n10\n', {
      emptyLabel: label,
      locale: 'tr-TR',
    });
    expect(preview.numberLocale).toBe('tr-TR');
    const plan = buildImport(
      preview,
      [{ label: 'tutar', type: 'decimal', currency: null }],
      'tr-TR',
      () => 't',
    );
    expect(plan.rows[0]!.cells.t).toEqual({ kind: 'decimal', value: '1234.56' });
  });
});

describe('export', () => {
  const columns: DatasetColumn[] = [
    { id: 'a', label: 'Not', type: 'text', unit: null, currency: null },
    { id: 'b', label: 'Değer', type: 'number', unit: null, currency: null },
  ];
  const row = (id: string, cells: DatasetRow['cells']) => ({ id, cells }) as DatasetRow;

  it('neutralizes formula-like text but never negative numbers', () => {
    const rows = [
      row('1', { a: { kind: 'text', value: '=HYPERLINK("x")' }, b: { kind: 'number', value: -5 } }),
      row('2', { a: { kind: 'text', value: 'çok, satır\nlı' } }),
    ];
    const safe = exportDataset(columns, rows);
    expect(safe.neutralized).toBe(1);
    expect(safe.text).toBe('Not,Değer\r\n"\'=HYPERLINK(""x"")",-5\r\n"çok, satır\nlı",');
    const raw = exportDataset(columns, rows, { safe: false });
    expect(raw.text.split('\r\n')[1]).toBe('"=HYPERLINK(""x"")",-5');
    expect(neutralizeFormula('@SUM(A1)').text).toBe("'@SUM(A1)");
  });

  it('round-trips through the parser', () => {
    const rows = [
      row('1', { a: { kind: 'text', value: 'Ayşe "A"' }, b: { kind: 'number', value: 1.5 } }),
    ];
    const { text } = exportDataset(columns, rows, { delimiter: ';' });
    expect(parseDelimited(text).rows).toEqual([
      ['Not', 'Değer'],
      ['Ayşe "A"', '1.5'],
    ]);
  });
});
