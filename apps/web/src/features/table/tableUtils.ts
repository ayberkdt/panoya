import type { CellValue, ColumnType, DatasetColumn, DatasetRow } from '@panoya/domain';
import type { MessageKey } from '../../i18n';

// eslint-disable-next-line no-control-regex -- control characters are invalid in file names
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]+/g;

export type SortSpec = { columnId: string; direction: 'asc' | 'desc' } | null;
export type FilterSpec = { columnId: string; optionId: string | null } | null;

export const columnTypeKey: Record<ColumnType, MessageKey> = {
  text: 'table.type.text',
  number: 'table.type.number',
  decimal: 'table.type.decimal',
  money: 'table.type.money',
  boolean: 'table.type.boolean',
  date: 'table.type.date',
  category: 'table.type.category',
  select: 'table.type.select',
  email: 'table.type.email',
  url: 'table.type.url',
};

/** Order in which types are offered in pickers: most common first. */
export const COLUMN_TYPE_ORDER: ColumnType[] = [
  'text',
  'select',
  'number',
  'date',
  'email',
  'url',
  'money',
  'decimal',
  'boolean',
  'category',
];

function sortKey(
  cell: CellValue | undefined,
  column: DatasetColumn | undefined,
): number | string | null {
  if (!cell || cell.kind === 'missing') return null;
  switch (cell.kind) {
    case 'number':
      return cell.value;
    case 'decimal':
      return Number(cell.value);
    case 'money':
      return Number(cell.amount);
    case 'boolean':
      return cell.value ? 1 : 0;
    case 'select': {
      // Choices sort in their defined order (e.g. Atılmadı → Gönderildi → Olumlu), not alphabetically.
      const index = column?.options?.findIndex((o) => o.id === cell.optionId) ?? -1;
      return index < 0 ? null : index;
    }
    case 'date':
    case 'text':
      return cell.value;
  }
}

const collator = new Intl.Collator('tr-TR', { numeric: true, sensitivity: 'base' });

/**
 * View-only sort (spec 10): returns a new array, rows keep their ids and stored rank, missing
 * values always last. Never used for analytics.
 */
export function sortRows(
  rows: DatasetRow[],
  sort: SortSpec,
  columns: DatasetColumn[],
): DatasetRow[] {
  if (!sort) return rows;
  const column = columns.find((c) => c.id === sort.columnId);
  const dir = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const ka = sortKey(a.cells[sort.columnId], column);
    const kb = sortKey(b.cells[sort.columnId], column);
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    const c =
      typeof ka === 'number' && typeof kb === 'number'
        ? ka - kb
        : collator.compare(String(ka), String(kb));
    return c * dir;
  });
}

/** View-only filter on one choice (optionId null = rows where the choice is empty). */
export function filterRows(rows: DatasetRow[], filter: FilterSpec): DatasetRow[] {
  if (!filter) return rows;
  return rows.filter((r) => {
    const cell = r.cells[filter.columnId];
    return filter.optionId === null
      ? cell === undefined
      : cell?.kind === 'select' && cell.optionId === filter.optionId;
  });
}

/** Count of rows per option of a select column (plus empty), in option order. */
export function optionCounts(
  rows: DatasetRow[],
  column: DatasetColumn,
): { optionId: string | null; count: number }[] {
  const counts = new Map<string | null, number>();
  for (const row of rows) {
    const cell = row.cells[column.id];
    const key = cell?.kind === 'select' ? cell.optionId : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out = (column.options ?? []).map((o) => ({
    optionId: o.id as string | null,
    count: counts.get(o.id) ?? 0,
  }));
  const empty = counts.get(null) ?? 0;
  if (empty > 0) out.push({ optionId: null, count: empty });
  return out;
}

export function isNumericColumn(column: DatasetColumn): boolean {
  return column.type === 'number' || column.type === 'decimal' || column.type === 'money';
}

/** Saves text as a file through a user-initiated download (no network). */
export function downloadText(
  filename: string,
  text: string,
  mime = 'text/csv;charset=utf-8',
): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(name: string, ext: string): string {
  const base = name.trim().replace(UNSAFE_FILENAME_CHARS, '_').slice(0, 80) || 'tablo';
  return `${base}.${ext}`;
}

export function newColumnId(existing: readonly DatasetColumn[]): string {
  let n = existing.length + 1;
  const ids = new Set(existing.map((c) => c.id));
  while (ids.has(`c${n}`)) n++;
  return `c${n}`;
}

export function newOptionId(existing: readonly { id: string }[]): string {
  let n = existing.length + 1;
  const ids = new Set(existing.map((o) => o.id));
  while (ids.has(`o${n}`)) n++;
  return `o${n}`;
}
