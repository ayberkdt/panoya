import {
  CURRENCY_RE,
  DECIMAL_RE,
  EMAIL_RE,
  WEB_URL_RE,
  type CellValue,
  type ColumnType,
  type DatasetColumn,
  type OptionColor,
  type SelectOption,
} from '@panoya/domain';

export type DataLocale = 'tr-TR' | 'en-US';

export type ParseOutcome =
  | { ok: true; value: CellValue }
  | {
      ok: false;
      reason: 'number' | 'date' | 'boolean' | 'currency' | 'tooLong' | 'email' | 'url' | 'option';
    };

const SEPARATORS: Record<DataLocale, { group: string; decimal: string }> = {
  'tr-TR': { group: '.', decimal: ',' },
  'en-US': { group: ',', decimal: '.' },
};

/**
 * Parses a number written in `locale` into a canonical decimal string, or null. Explicit: the
 * locale decides what "1,234" means — never guessed (spec 10).
 *   tr-TR: "1.234,56" → "1234.56", "1,5" → "1.5", "-12" → "-12"
 *   en-US: "1,234.56" → "1234.56"
 * Group separators must be in valid positions (groups of three).
 */
export function parseLocaleDecimal(raw: string, locale: DataLocale): string | null {
  const { group, decimal } = SEPARATORS[locale];
  let s = raw.trim().replace(/[\u00a0\u202f\u2009]/g, ' '); // no-break / narrow / thin spaces
  if (s === '') return null;
  let negative = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    negative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) s = s.slice(1).trim();
  const [intPartRaw, fracPart, extra] = s.split(decimal);
  if (extra !== undefined || intPartRaw === undefined) return null;
  let intPart = intPartRaw.replace(/ /g, '');
  if (intPart.includes(group)) {
    const groups = intPart.split(group);
    if (!/^\d{1,3}$/.test(groups[0] ?? '') || groups.slice(1).some((g) => !/^\d{3}$/.test(g)))
      return null;
    intPart = groups.join('');
  }
  if (!/^\d+$/.test(intPart) && !(intPart === '' && fracPart !== undefined)) return null;
  if (fracPart !== undefined && !/^\d+$/.test(fracPart)) return null;
  const intNorm = (intPart || '0').replace(/^0+(?=\d)/, '');
  const fracNorm = fracPart?.replace(/0+$/, '') ?? '';
  const body = fracNorm ? `${intNorm}.${fracNorm}` : intNorm;
  const canonical = negative && body !== '0' ? `-${body}` : body;
  return DECIMAL_RE.test(canonical) ? canonical : null;
}

/**
 * Which locales can read every value; "ambiguous" when both can (e.g. "1.234" or "1,5" alone is
 * readable both ways but with different meaning) so the user must choose.
 */
export function detectNumberLocale(values: string[]): DataLocale | 'ambiguous' | 'none' {
  const sample = values.map((v) => v.trim()).filter((v) => v !== '');
  if (sample.length === 0) return 'none';
  const ok = (locale: DataLocale) => sample.every((v) => parseLocaleDecimal(v, locale) !== null);
  const tr = ok('tr-TR');
  const en = ok('en-US');
  if (tr && en) {
    const same = sample.every(
      (v) => parseLocaleDecimal(v, 'tr-TR') === parseLocaleDecimal(v, 'en-US'),
    );
    return same ? 'tr-TR' : 'ambiguous';
  }
  return tr ? 'tr-TR' : en ? 'en-US' : 'none';
}

const TRUE = new Set(['true', 'evet', 'yes', 'doğru', 'dogru', 'e', 'y', '1']);
const FALSE = new Set(['false', 'hayır', 'hayir', 'no', 'yanlış', 'yanlis', 'h', 'n', '0']);

export function parseLocaleDate(raw: string, locale: DataLocale): string | null {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if (locale === 'tr-TR' && (match = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(s))) {
    [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if (locale === 'en-US' && (match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) {
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else return null;
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Column shape needed to parse/format cells. */
export type CellColumn = Pick<DatasetColumn, 'type' | 'currency'> &
  Partial<Pick<DatasetColumn, 'options'>>;

const OPTION_KEY = (label: string) => label.trim().normalize('NFC').toLocaleLowerCase('tr-TR');

/** Text → typed cell for a column. Empty input is `missing` (never 0 or ""). */
export function parseCell(raw: string, column: CellColumn, locale: DataLocale): ParseOutcome {
  const s = raw.trim();
  if (s === '') return { ok: true, value: { kind: 'missing' } };
  switch (column.type) {
    case 'text':
    case 'category':
      return raw.length > 10_000
        ? { ok: false, reason: 'tooLong' }
        : { ok: true, value: { kind: 'text', value: raw } };
    case 'email':
      return EMAIL_RE.test(s)
        ? { ok: true, value: { kind: 'text', value: s } }
        : { ok: false, reason: 'email' };
    case 'url': {
      const candidate = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
      return WEB_URL_RE.test(candidate)
        ? { ok: true, value: { kind: 'text', value: candidate } }
        : { ok: false, reason: 'url' };
    }
    case 'select': {
      const option = (column.options ?? []).find(
        (o) => OPTION_KEY(o.label) === OPTION_KEY(s) || o.id === s,
      );
      return option
        ? { ok: true, value: { kind: 'select', optionId: option.id } }
        : { ok: false, reason: 'option' };
    }
    case 'number': {
      const dec = parseLocaleDecimal(s, locale);
      const n = dec === null ? NaN : Number(dec);
      return Number.isFinite(n)
        ? { ok: true, value: { kind: 'number', value: n } }
        : { ok: false, reason: 'number' };
    }
    case 'decimal': {
      const dec = parseLocaleDecimal(s, locale);
      return dec === null
        ? { ok: false, reason: 'number' }
        : { ok: true, value: { kind: 'decimal', value: dec } };
    }
    case 'money': {
      // Accept "300", "300 EUR", "EUR 300", "300€" with the column currency.
      const m = /^([A-Z]{3}|€|\$|₺)?\s*([-−+]?[\d.,\s]+?)\s*([A-Z]{3}|€|\$|₺)?$/.exec(s);
      const symbol = { '€': 'EUR', $: 'USD', '₺': 'TRY' } as Record<string, string>;
      const code = m ? (symbol[m[1] ?? m[3] ?? ''] ?? m[1] ?? m[3] ?? column.currency) : null;
      const dec = m ? parseLocaleDecimal(m[2] ?? '', locale) : null;
      if (dec === null) return { ok: false, reason: 'number' };
      if (!code || !CURRENCY_RE.test(code) || (column.currency && code !== column.currency)) {
        return { ok: false, reason: 'currency' };
      }
      return { ok: true, value: { kind: 'money', amount: dec, currency: code } };
    }
    case 'boolean': {
      const key = s.toLocaleLowerCase('tr-TR');
      if (TRUE.has(key)) return { ok: true, value: { kind: 'boolean', value: true } };
      if (FALSE.has(key)) return { ok: true, value: { kind: 'boolean', value: false } };
      return { ok: false, reason: 'boolean' };
    }
    case 'date': {
      const iso = parseLocaleDate(s, locale);
      return iso
        ? { ok: true, value: { kind: 'date', value: iso } }
        : { ok: false, reason: 'date' };
    }
  }
}

/** Suggests a column type from sample values. A suggestion only: the user confirms (spec 10). */
export function inferColumnType(values: string[], locale: DataLocale): ColumnType {
  const sample = values.filter((v) => v.trim() !== '').slice(0, 500);
  if (sample.length === 0) return 'text';
  const all = (type: ColumnType) =>
    sample.every((v) => parseCell(v, { type, currency: null }, locale).ok);
  if (all('number')) return 'number';
  if (all('date')) return 'date';
  if (sample.every((v) => /^(true|false|evet|hayır|hayir|yes|no)$/i.test(v.trim())))
    return 'boolean';
  if (all('email')) return 'email';
  if (sample.every((v) => /^https?:\/\//i.test(v.trim())) && all('url')) return 'url';
  // Few distinct short values repeated across rows → a status/choice column.
  const distinct = new Set(sample.map((v) => OPTION_KEY(v)));
  const repeats = distinct.size < sample.length;
  const fewChoices = distinct.size <= Math.min(12, Math.ceil(sample.length * 0.6));
  const avgLength = sample.reduce((n, v) => n + v.trim().length, 0) / sample.length;
  if (
    sample.length >= 4 &&
    repeats &&
    fewChoices &&
    avgLength <= 16 &&
    sample.every((v) => v.trim().length <= 40)
  ) {
    return 'select';
  }
  return 'text';
}

const AUTO_COLORS: OptionColor[] = [
  'gray',
  'blue',
  'green',
  'yellow',
  'red',
  'purple',
  'orange',
  'pink',
  'brown',
];

/**
 * Colour that matches what a status label means (done/approved → green, rejected → red,
 * waiting → yellow, sent/in progress → blue, not done/not sent → gray). Negations are checked
 * first so "Yapılmadı" is not read as "Yapıldı". Unknown labels get null.
 */
export function colorForLabel(label: string): OptionColor | null {
  const k = OPTION_KEY(label);
  if (/(madı|medi|madi|mamış|memiş|\byok\b|^hayır$|^no\b|^not\b|\bnone\b)/.test(k)) return 'gray';
  if (
    /(olumsuz|reddedil|\bred\b|\bret\b|negative|reject|declin|iptal|cancel|fail|başarısız)/.test(k)
  )
    return 'red';
  if (/(bekl|waiting|pending|on hold|askıda)/.test(k)) return 'yellow';
  if (
    /(olumlu|onay|kabul|yapıldı|tamam|bitti|done|approved|accepted|positive|success|başarılı)/.test(
      k,
    )
  )
    return 'green';
  if (/(gönderil|\bsent\b|devam|progress|başla|started|\bopen\b|açık)/.test(k)) return 'blue';
  return null;
}

/** Options for a select column built from its distinct values (first-seen order). */
export function optionsFromValues(
  values: string[],
  makeId: (index: number) => string = (i) => `o${i + 1}`,
): SelectOption[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const label = v.trim();
    if (label && !seen.has(OPTION_KEY(label))) seen.set(OPTION_KEY(label), label.slice(0, 100));
  }
  let rotation = 0;
  return [...seen.values()].slice(0, 50).map((label, i) => ({
    id: makeId(i),
    label,
    color: colorForLabel(label) ?? (AUTO_COLORS[rotation++ % AUTO_COLORS.length] as OptionColor),
  }));
}

/** Display text for a cell in `locale` (input format; exact value, no rounding). */
export function formatCell(
  cell: CellValue | undefined,
  locale: DataLocale,
  column?: CellColumn,
): string {
  if (!cell || cell.kind === 'missing') return '';
  const dec = SEPARATORS[locale].decimal;
  const decimalText = (v: string) => (dec === '.' ? v : v.replace('.', dec));
  switch (cell.kind) {
    case 'text':
      return cell.value;
    case 'number':
      return decimalText(String(cell.value));
    case 'decimal':
      return decimalText(cell.value);
    case 'money':
      return `${decimalText(cell.amount)} ${cell.currency}`;
    case 'boolean':
      return locale === 'tr-TR' ? (cell.value ? 'evet' : 'hayır') : cell.value ? 'true' : 'false';
    case 'date':
      return cell.value;
    case 'select':
      return column?.options?.find((o) => o.id === cell.optionId)?.label ?? '';
  }
}

/** Plain export text (CSV/TSV): locale-independent numbers with "." so files re-import exactly. */
export function exportCell(cell: CellValue | undefined, column?: CellColumn): string {
  if (!cell || cell.kind === 'missing') return '';
  switch (cell.kind) {
    case 'text':
      return cell.value;
    case 'number':
      return String(cell.value);
    case 'decimal':
      return cell.value;
    case 'money':
      return cell.amount;
    case 'boolean':
      return cell.value ? 'true' : 'false';
    case 'date':
      return cell.value;
    case 'select':
      return column?.options?.find((o) => o.id === cell.optionId)?.label ?? '';
  }
}

/**
 * Converts existing cells for a type change preview: returns converted values and the rows
 * that cannot be converted (shown to the user before committing `setColumnType`). Converting to
 * `select` without options creates them from the distinct values.
 */
export function convertCells(
  rows: { id: string; cell: CellValue | undefined }[],
  to: CellColumn,
  locale: DataLocale,
  from?: CellColumn,
): { values: Record<string, CellValue>; invalid: string[]; options?: SelectOption[] } {
  const texts = rows.map(({ id, cell }) => ({
    id,
    text: cell && cell.kind !== 'missing' ? formatCell(cell, locale, from) : '',
  }));
  let target = to;
  let options: SelectOption[] | undefined;
  if (to.type === 'select' && (to.options ?? []).length === 0) {
    options = optionsFromValues(texts.map((t) => t.text));
    target = { ...to, options };
  }
  const values: Record<string, CellValue> = {};
  const invalid: string[] = [];
  for (const { id, text } of texts) {
    if (text === '') continue;
    const outcome = parseCell(text, target, locale);
    if (outcome.ok) values[id] = outcome.value;
    else invalid.push(id);
  }
  return options ? { values, invalid, options } : { values, invalid };
}
