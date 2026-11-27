import type { DatasetColumn, DatasetRow } from '@panoya/domain';
import { exportCell } from './cells';
import { neutralizeFormula, toDelimited, type Delimiter } from './csv';

export interface ExportResult {
  text: string;
  /** Text cells prefixed with ' to stop spreadsheet formula evaluation (user is told). */
  neutralized: number;
}

/**
 * CSV/TSV export (spec 10). `safe` (default) neutralizes formula-like text cells; numbers are
 * never altered. Use JSON backup for an exact typed round-trip; CSV is for spreadsheets.
 */
export function exportDataset(
  columns: DatasetColumn[],
  rows: DatasetRow[],
  options: {
    delimiter?: Delimiter;
    safe?: boolean;
    bom?: boolean;
    lineEnding?: '\r\n' | '\n';
  } = {},
): ExportResult {
  const delimiter = options.delimiter ?? ',';
  const safe = options.safe ?? true;
  let neutralized = 0;
  const header = columns.map((c) => {
    if (!safe) return c.label;
    const n = neutralizeFormula(c.label);
    if (n.changed) neutralized++;
    return n.text;
  });
  const body = rows.map((row) =>
    columns.map((c) => {
      const cell = row.cells[c.id];
      const text = exportCell(cell, c);
      // User-written text (labels too) is neutralized; numbers never are.
      if (!safe || !cell || (cell.kind !== 'text' && cell.kind !== 'select')) return text;
      const n = neutralizeFormula(text);
      if (n.changed) neutralized++;
      return n.text;
    }),
  );
  const text = toDelimited([header, ...body], delimiter, options.lineEnding ?? '\r\n');
  return { text: (options.bom ? '﻿' : '') + text, neutralized };
}
