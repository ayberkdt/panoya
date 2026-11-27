import { z } from 'zod';

/**
 * Typed dataset values (spec 03 / 10). `missing` is distinct from 0, false and the empty string.
 * Decimals and money amounts are canonical decimal strings, never JS floats.
 */
export const columnTypes = [
  'text',
  'number',
  'decimal',
  'money',
  'boolean',
  'date',
  'category',
  'select',
  'email',
  'url',
] as const;
export type ColumnType = (typeof columnTypes)[number];

export const DECIMAL_RE = /^-?(0|[1-9]\d*)(\.\d+)?$/;
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const CURRENCY_RE = /^[A-Z]{3}$/;
/** Loose but strict enough to catch typos; a column of addresses, not RFC 5322 validation. */
export const EMAIL_RE = /^[^\s@<>()[\]",;]+@[^\s@<>()[\]",;]+\.[^\s@<>()[\]",;]{2,}$/;
/** Only plain web links are stored in URL columns (same rule as link blocks, spec 08). */
export const WEB_URL_RE = /^https?:\/\/[^\s/?#@]+(\.[^\s/?#@]+)*(:\d+)?([/?#][^\s]*)?$/i;

export const DATASET_LIMITS = {
  columns: 200,
  rows: 20_000,
  cells: 200_000,
  textCell: 10_000,
  selectOptions: 50,
  /** Change-history entries kept per row (oldest dropped first). */
  historyPerRow: 100,
  /** Original imported text kept for recovery (spec 10); larger sources keep metadata only. */
  originalSourceBytes: 2 * 1024 * 1024,
} as const;

function isRealDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const cellValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('missing') }),
  z.object({ kind: z.literal('text'), value: z.string().max(DATASET_LIMITS.textCell) }),
  z.object({ kind: z.literal('number'), value: z.number().refine(Number.isFinite, 'non-finite') }),
  z.object({ kind: z.literal('decimal'), value: z.string().regex(DECIMAL_RE) }),
  z.object({
    kind: z.literal('money'),
    amount: z.string().regex(DECIMAL_RE),
    currency: z.string().regex(CURRENCY_RE),
  }),
  z.object({ kind: z.literal('date'), value: z.string().refine(isRealDate, 'invalid date') }),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }),
  /** Single choice from the column's options; stores the stable option id, not the label. */
  z.object({ kind: z.literal('select'), optionId: z.string().min(1).max(40) }),
]);
export type CellValue = z.infer<typeof cellValueSchema>;

export const MISSING: CellValue = { kind: 'missing' };

export const columnIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

/** Named colours resolved by the UI theme (each has light/dark tokens with ≥ 4.5:1 text). */
export const optionColors = [
  'gray',
  'brown',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
] as const;
export type OptionColor = (typeof optionColors)[number];

export const selectOptionSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  label: z.string().trim().min(1).max(100),
  color: z.enum(optionColors),
});
export type SelectOption = z.infer<typeof selectOptionSchema>;

export const datasetColumnSchema = z.object({
  id: columnIdSchema,
  label: z.string().trim().min(1).max(200),
  type: z.enum(columnTypes),
  unit: z.string().max(40).nullable(),
  currency: z.string().regex(CURRENCY_RE).nullable(),
  /** Choices of a `select` column, in display order. */
  options: z.array(selectOptionSchema).max(DATASET_LIMITS.selectOptions).optional(),
  /** Record every change of this column in the row's history (default on for `select`). */
  trackHistory: z.boolean().optional(),
});
export type DatasetColumn = z.infer<typeof datasetColumnSchema>;

/** One recorded change. Texts are snapshots, so history stays readable after options change. */
export const rowHistoryEntrySchema = z.object({
  at: z.iso.datetime({ offset: false }),
  columnId: columnIdSchema,
  column: z.string().max(200),
  from: z.string().max(500),
  to: z.string().max(500),
});
export type RowHistoryEntry = z.infer<typeof rowHistoryEntrySchema>;

export const datasetSourceSchema = z.object({
  kind: z.enum(['manual', 'csv', 'tsv', 'paste']),
  filename: z.string().max(260).nullable(),
  delimiter: z.enum([',', ';', '\t']).nullable(),
  locale: z.enum(['tr-TR', 'en-US']).nullable(),
  importedAt: z.iso.datetime({ offset: false }).nullable(),
  /** Original text (≤ 2 MB) so the import can be redone; null when not retained. */
  original: z.string().nullable(),
});
export type DatasetSource = z.infer<typeof datasetSourceSchema>;

/** Which cell kinds a column type accepts (besides `missing`). */
export const kindsForType: Record<ColumnType, CellValue['kind'][]> = {
  text: ['text'],
  category: ['text'],
  number: ['number'],
  decimal: ['decimal'],
  money: ['money'],
  boolean: ['boolean'],
  date: ['date'],
  select: ['select'],
  email: ['text'],
  url: ['text'],
};

/** Validates a cell against its column; returns a reason code or null when valid. */
export function cellProblem(column: DatasetColumn, cell: CellValue): string | null {
  if (cell.kind === 'missing') return null;
  if (!kindsForType[column.type].includes(cell.kind)) return 'type';
  if (cell.kind === 'money' && column.currency && cell.currency !== column.currency)
    return 'currency';
  if (cell.kind === 'select' && !(column.options ?? []).some((o) => o.id === cell.optionId))
    return 'option';
  if (cell.kind === 'text' && column.type === 'email' && !EMAIL_RE.test(cell.value)) return 'email';
  if (cell.kind === 'text' && column.type === 'url' && !WEB_URL_RE.test(cell.value)) return 'url';
  return null;
}

export function columnsValid(columns: DatasetColumn[]): boolean {
  if (columns.length === 0 || columns.length > DATASET_LIMITS.columns) return false;
  if (new Set(columns.map((c) => c.id)).size !== columns.length) return false;
  return columns.every((c) => {
    if (c.type === 'money' && c.currency === null) return false;
    const options = c.options ?? [];
    if (new Set(options.map((o) => o.id)).size !== options.length) return false;
    if (new Set(options.map((o) => o.label.toLocaleLowerCase('tr-TR'))).size !== options.length)
      return false;
    return true;
  });
}

/** Human-readable text of a cell (history snapshots, exports, search). Exact, not rounded. */
export function cellText(column: DatasetColumn, cell: CellValue | undefined): string {
  if (!cell) return '';
  switch (cell.kind) {
    case 'missing':
      return '';
    case 'text':
    case 'decimal':
    case 'date':
      return cell.value;
    case 'number':
      return String(cell.value);
    case 'money':
      return `${cell.amount} ${cell.currency}`;
    case 'boolean':
      return cell.value ? 'true' : 'false';
    case 'select':
      return column.options?.find((o) => o.id === cell.optionId)?.label ?? '';
  }
}

/** Whether changes to this column are written to row history. */
export function tracksHistory(column: DatasetColumn): boolean {
  return column.trackHistory ?? column.type === 'select';
}

/** Ready-made status sets (spec: "yapıldı/yapılmadı, onay geldi/red geldi" tracking). */
export const STATUS_PRESETS: Record<'task' | 'mail' | 'decision', SelectOption[]> = {
  task: [
    { id: 'todo', label: 'Yapılmadı', color: 'gray' },
    { id: 'doing', label: 'Devam ediyor', color: 'blue' },
    { id: 'done', label: 'Yapıldı', color: 'green' },
  ],
  mail: [
    { id: 'notsent', label: 'Atılmadı', color: 'gray' },
    { id: 'sent', label: 'Gönderildi', color: 'blue' },
    { id: 'waiting', label: 'Yanıt bekleniyor', color: 'yellow' },
    { id: 'positive', label: 'Olumlu', color: 'green' },
    { id: 'negative', label: 'Olumsuz', color: 'red' },
  ],
  decision: [
    { id: 'pending', label: 'Beklemede', color: 'yellow' },
    { id: 'approved', label: 'Onaylandı', color: 'green' },
    { id: 'rejected', label: 'Reddedildi', color: 'red' },
  ],
};
