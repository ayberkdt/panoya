import type { CellValue, ColumnType, DatasetColumn } from '@panoya/domain';
import {
  detectNumberLocale,
  inferColumnType,
  optionsFromValues,
  parseCell,
  type DataLocale,
} from './cells';
import { CSV_LIMITS, normalizeHeaders, parseDelimited, type Delimiter } from './csv';

export interface ImportPreview {
  delimiter: Delimiter;
  headers: string[];
  /** Raw text rows (without header). */
  body: string[][];
  suggestedTypes: ColumnType[];
  /** Number locale needed to read numeric columns; "ambiguous" requires a user choice. */
  numberLocale: DataLocale | 'ambiguous' | 'none';
  raggedRows: number[];
  cellCount: number;
}

export function previewImport(
  text: string,
  options: {
    delimiter?: Delimiter;
    hasHeader?: boolean;
    emptyLabel: (i: number) => string;
    locale: DataLocale;
  },
): ImportPreview {
  const parsed = parseDelimited(text, options.delimiter ? { delimiter: options.delimiter } : {});
  const hasHeader = options.hasHeader ?? true;
  const width = Math.max(...parsed.rows.map((r) => r.length));
  const pad = (r: string[]) =>
    r.length < width ? [...r, ...Array<string>(width - r.length).fill('')] : r;
  const headerRow = hasHeader ? pad(parsed.rows[0] ?? []) : Array.from({ length: width }, () => '');
  const body = (hasHeader ? parsed.rows.slice(1) : parsed.rows).map(pad);
  const headers = normalizeHeaders(headerRow, options.emptyLabel);
  const columnValues = (c: number) => body.map((r) => r[c] ?? '');
  const numericLike = (vals: string[]) => vals.some((v) => /\d/.test(v));
  const numericValues = headers.flatMap((_, c) =>
    numericLike(columnValues(c)) ? columnValues(c).filter((v) => /^[\s\d.,+\-−]+$/.test(v)) : [],
  );
  const numberLocale = detectNumberLocale(numericValues);
  const typeLocale: DataLocale = numberLocale === 'en-US' ? 'en-US' : options.locale;
  return {
    delimiter: parsed.delimiter,
    headers,
    body,
    suggestedTypes: headers.map((_, c) => inferColumnType(columnValues(c), typeLocale)),
    numberLocale,
    raggedRows: parsed.raggedRows,
    cellCount: body.length * width,
  };
}

/** Header words that mark a progress/decision column (counts bar + history on import). */
const STATUS_WORDS =
  /(durum|status|state|onay|karar|sonu[cç]|a[sş]ama|stage|mail|yan[ıi]t|cevap|ba[sş]vuru|takip|progress|approval|decision|reply)/i;

export function looksLikeStatus(header: string): boolean {
  return STATUS_WORDS.test(header);
}

export interface ImportPlan {
  columns: DatasetColumn[];
  rows: { cells: Record<string, CellValue> }[];
  /** 0-based body row/column of every value that does not fit its column type. */
  problems: { row: number; column: number; reason: string; raw: string }[];
}

/** Applies the confirmed schema; problems are reported, never silently coerced (spec 10). */
export function buildImport(
  preview: ImportPreview,
  schema: { label: string; type: ColumnType; currency: string | null }[],
  locale: DataLocale,
  makeColumnId: (index: number) => string,
): ImportPlan {
  if (preview.cellCount > CSV_LIMITS.cells) {
    return {
      columns: [],
      rows: [],
      problems: [{ row: -1, column: -1, reason: 'tooManyCells', raw: String(preview.cellCount) }],
    };
  }
  const columns: DatasetColumn[] = schema.map((s, i) => {
    const column: DatasetColumn = {
      id: makeColumnId(i),
      label: s.label,
      type: s.type,
      unit: null,
      currency: s.type === 'money' ? s.currency : null,
    };
    // Choice columns get one option (with a colour) per distinct value, in first-seen order.
    if (s.type === 'select') {
      column.options = optionsFromValues(preview.body.map((r) => r[i] ?? ''));
      column.trackHistory = looksLikeStatus(s.label);
    }
    return column;
  });
  const problems: ImportPlan['problems'] = [];
  const rows = preview.body.map((raw, r) => {
    const cells: Record<string, CellValue> = {};
    columns.forEach((col, c) => {
      const outcome = parseCell(raw[c] ?? '', col, locale);
      if (!outcome.ok)
        problems.push({ row: r, column: c, reason: outcome.reason, raw: raw[c] ?? '' });
      else if (outcome.value.kind !== 'missing') cells[col.id] = outcome.value;
    });
    return { cells };
  });
  return { columns, rows, problems };
}
