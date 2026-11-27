/**
 * RFC 4180-style delimited text parser (spec 10): BOM, CRLF/LF/CR, quoted fields with "" escapes,
 * multiline cells, delimiter detection among comma / semicolon / tab. Pure and synchronous; the UI
 * runs it on files up to the import limit.
 */
export type Delimiter = ',' | ';' | '\t';
export const DELIMITERS: readonly Delimiter[] = [',', ';', '\t'];

export const CSV_LIMITS = {
  bytes: 10 * 1024 * 1024,
  cells: 100_000,
} as const;

export interface ParseResult {
  rows: string[][];
  delimiter: Delimiter;
  /** Rows whose field count differs from the header (1-based line numbers). */
  raggedRows: number[];
}

export class CsvError extends Error {
  constructor(
    readonly code: 'unterminatedQuote' | 'tooLarge' | 'empty',
    readonly line: number,
  ) {
    super(`${code} at line ${line}`);
    this.name = 'CsvError';
  }
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Picks the delimiter that yields the most consistent multi-column split of the first lines. */
export function detectDelimiter(text: string): Delimiter {
  const sample = stripBom(text).slice(0, 64 * 1024);
  let best: Delimiter = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    let rows: string[][];
    try {
      rows = parseWith(sample, d, 20, true).rows;
    } catch {
      continue;
    }
    if (rows.length === 0) continue;
    const counts = rows.map((r) => r.length);
    const first = counts[0] ?? 1;
    if (first < 2) continue;
    const consistent = counts.filter((c) => c === first).length / counts.length;
    const score = consistent * 10 + Math.min(first, 10) / 10;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export function parseDelimited(text: string, options: { delimiter?: Delimiter } = {}): ParseResult {
  if (text.length > CSV_LIMITS.bytes) throw new CsvError('tooLarge', 0);
  const source = stripBom(text);
  const delimiter = options.delimiter ?? detectDelimiter(source);
  const { rows } = parseWith(source, delimiter, Number.POSITIVE_INFINITY, false);
  if (rows.length === 0) throw new CsvError('empty', 1);
  const width = rows[0]?.length ?? 0;
  const raggedRows: number[] = [];
  rows.forEach((r, i) => {
    if (r.length !== width) raggedRows.push(i + 1);
  });
  return { rows, delimiter, raggedRows };
}

function parseWith(
  text: string,
  delimiter: Delimiter,
  maxRows: number,
  lenient: boolean,
): { rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let quoteStartLine = 1;
  let i = 0;
  const n = text.length;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    // Skip completely empty lines (a lone empty field), common at the end of files.
    if (!(row.length === 1 && row[0] === '')) rows.push(row);
    row = [];
  };
  while (i < n && rows.length < maxRows) {
    const ch = text[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      if (ch === '\n') line++;
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
      quoteStartLine = line;
      i++;
      continue;
    }
    if (ch === delimiter) {
      pushField();
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      pushRow();
      line++;
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (quoted && !lenient) throw new CsvError('unterminatedQuote', quoteStartLine);
  if (rows.length < maxRows && (field !== '' || row.length > 0)) pushRow();
  return { rows };
}

/** Header labels: trimmed, empty → "Sütun N", duplicates → "x (2)". */
export function normalizeHeaders(
  headers: string[],
  emptyLabel: (index: number) => string,
): string[] {
  const seen = new Map<string, number>();
  return headers.map((raw, i) => {
    const base = raw.trim() || emptyLabel(i + 1);
    const key = base.toLocaleLowerCase('tr-TR');
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

// ------------------------------------------------------------------------------- serialization

/** Characters that make spreadsheet apps evaluate a text cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Neutralizes formula-like text for spreadsheet-safe export (spec 10). Only applied to text
 * values; real numbers (including negatives) are never prefixed.
 */
export function neutralizeFormula(text: string): { text: string; changed: boolean } {
  return FORMULA_START.test(text) ? { text: `'${text}`, changed: true } : { text, changed: false };
}

export function quoteField(value: string, delimiter: Delimiter): string {
  return /[",\n\r;\t]/.test(value) || value.includes(delimiter) || /^\s|\s$/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

export function toDelimited(
  rows: string[][],
  delimiter: Delimiter,
  lineEnding: '\r\n' | '\n' = '\r\n',
): string {
  return rows.map((r) => r.map((v) => quoteField(v, delimiter)).join(delimiter)).join(lineEnding);
}
