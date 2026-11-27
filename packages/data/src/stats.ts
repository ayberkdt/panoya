import type { CellValue, DatasetColumn, DatasetRow } from '@panoya/domain';

/** "Maaş" → "maas", "Çıkış" → "cikis": Turkish lowercase, accents and dotless ı removed. */
function foldLabel(label: string): string {
  return label
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
}

/**
 * Table statistics (spec G4): exact decimal arithmetic on canonical decimal strings, never JS
 * floats, so a wallet of 0,10 + 0,20 shows 0,30. Pure functions; the UI only formats.
 */

const MAX_SCALE = 6;

function splitDecimal(value: string): { neg: boolean; int: string; frac: string } {
  const neg = value.startsWith('-');
  const [int = '0', frac = ''] = (neg ? value.slice(1) : value).split('.');
  return { neg, int, frac };
}

const scaleOf = (value: string) => Math.min(MAX_SCALE, splitDecimal(value).frac.length);

function toScaled(value: string, scale: number): bigint {
  const { neg, int, frac } = splitDecimal(value);
  const digits = int + frac.padEnd(scale, '0').slice(0, scale);
  const n = BigInt(digits.replace(/^0+(?=\d)/, '') || '0');
  return neg ? -n : n;
}

function fromScaled(n: bigint, scale: number): string {
  const neg = n < 0n;
  const abs = (neg ? -n : n).toString().padStart(scale + 1, '0');
  const int = abs.slice(0, abs.length - scale);
  const frac = scale ? abs.slice(abs.length - scale).replace(/0+$/, '') : '';
  const out = frac ? `${int}.${frac}` : int;
  return neg && out !== '0' ? `-${out}` : out;
}

/** Canonical decimal string of a numeric cell, or null for any other kind. */
export function numericValue(cell: CellValue | undefined): string | null {
  if (!cell) return null;
  if (cell.kind === 'decimal') return cell.value;
  if (cell.kind === 'money') return cell.amount;
  if (cell.kind === 'number') {
    const s = String(cell.value);
    return /e/i.test(s) ? cell.value.toFixed(MAX_SCALE) : s;
  }
  return null;
}

/** Exact sum of decimal strings. */
export function sumDecimals(values: string[]): string {
  const scale = values.reduce((m, v) => Math.max(m, scaleOf(v)), 0);
  return fromScaled(
    values.reduce((acc, v) => acc + toScaled(v, scale), 0n),
    scale,
  );
}

export function subtractDecimals(a: string, b: string): string {
  const scale = Math.max(scaleOf(a), scaleOf(b));
  return fromScaled(toScaled(a, scale) - toScaled(b, scale), scale);
}

export function compareDecimals(a: string, b: string): number {
  const scale = Math.max(scaleOf(a), scaleOf(b));
  const d = toScaled(a, scale) - toScaled(b, scale);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}

function absDecimal(value: string): string {
  return value.startsWith('-') ? value.slice(1) : value;
}

export interface NumberSummary {
  count: number;
  sum: string;
  /** Rounded half away from zero to max(scale, 2) decimals. */
  mean: string;
  min: string;
  max: string;
}

/** Summary of a number, decimal or money column; null when it has no values. */
export function summarizeColumn(rows: DatasetRow[], column: DatasetColumn): NumberSummary | null {
  const values = rows
    .map((r) => numericValue(r.cells[column.id]))
    .filter((v): v is string => v !== null);
  if (values.length === 0) return null;
  const scale = values.reduce((m, v) => Math.max(m, scaleOf(v)), 0);
  const total = values.reduce((acc, v) => acc + toScaled(v, scale), 0n);
  const outScale = Math.max(scale, 2);
  const factor = 10n ** BigInt(outScale - scale);
  const scaledTotal = total * factor;
  const count = BigInt(values.length);
  const half = count / 2n;
  const mean = scaledTotal >= 0n ? (scaledTotal + half) / count : -((-scaledTotal + half) / count);
  const sorted = [...values].sort(compareDecimals);
  return {
    count: values.length,
    sum: fromScaled(total, scale),
    mean: fromScaled(mean, outScale),
    min: sorted[0] as string,
    max: sorted[sorted.length - 1] as string,
  };
}

export const isNumericColumn = (c: DatasetColumn) =>
  c.type === 'number' || c.type === 'decimal' || c.type === 'money';

const INCOME = ['gelir', 'income', 'giris', 'maas', 'salary'];
const EXPENSE = ['gider', 'expense', 'harcama', 'cikis', 'odeme', 'spending'];

export interface WalletRoles {
  amount: string;
  /** Select column whose options say income or expense. */
  flow: string;
  income: string[];
  expense: string[];
  category: string | null;
  date: string | null;
}

/**
 * A table is a wallet when it has a money (or decimal) column and a choice column with an
 * income option and an expense option ("Gelir"/"Gider", "Income"/"Expense"). Recognised from the
 * columns, so a wallet the user builds by hand works the same as the template.
 */
export function detectWallet(columns: DatasetColumn[]): WalletRoles | null {
  const amount =
    columns.find((c) => c.type === 'money') ?? columns.find((c) => c.type === 'decimal');
  if (!amount) return null;
  for (const c of columns) {
    if (c.type !== 'select' || !c.options) continue;
    const income = c.options.filter((o) => INCOME.includes(foldLabel(o.label))).map((o) => o.id);
    const expense = c.options.filter((o) => EXPENSE.includes(foldLabel(o.label))).map((o) => o.id);
    if (income.length && expense.length) {
      const category =
        columns.find((x) => x.id !== c.id && x.type === 'select') ??
        columns.find((x) => x.type === 'category') ??
        null;
      const date = columns.find((x) => x.type === 'date') ?? null;
      return {
        amount: amount.id,
        flow: c.id,
        income,
        expense,
        category: category?.id ?? null,
        date: date?.id ?? null,
      };
    }
  }
  return null;
}

export interface WalletSummary {
  income: string;
  expense: string;
  balance: string;
  /** Rows that have an amount and a direction. */
  entries: number;
  /** Expense in the month of `today`. */
  monthExpense: string;
  /** Expense per category, largest first; `key` is the option id or text, null = none. */
  byCategory: { key: string | null; amount: string }[];
  /** Net (income − expense) for the last `months` months ending with today's, oldest first. */
  byMonth: { month: string; net: string }[];
}

function categoryKey(cell: CellValue | undefined): string | null {
  if (!cell) return null;
  if (cell.kind === 'select') return cell.optionId;
  if (cell.kind === 'text') return cell.value.trim() || null;
  return null;
}

function lastMonths(today: string, count: number): string[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(year, month - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Wallet statistics; `today` is a local YYYY-MM-DD so the month boundary follows the user. */
export function summarizeWallet(
  rows: DatasetRow[],
  roles: WalletRoles,
  today: string,
  months = 6,
): WalletSummary {
  const income: string[] = [];
  const expense: string[] = [];
  const monthExpense: string[] = [];
  const perCategory = new Map<string | null, string[]>();
  const monthKeys = lastMonths(today, months);
  const perMonth = new Map(monthKeys.map((m) => [m, [] as string[]]));
  const thisMonth = today.slice(0, 7);

  for (const row of rows) {
    const amount = numericValue(row.cells[roles.amount]);
    const flow = row.cells[roles.flow];
    if (amount === null || flow?.kind !== 'select') continue;
    const value = absDecimal(amount);
    const isIncome = roles.income.includes(flow.optionId);
    const isExpense = roles.expense.includes(flow.optionId);
    if (!isIncome && !isExpense) continue;
    const dateCell = roles.date ? row.cells[roles.date] : undefined;
    const month = dateCell?.kind === 'date' ? dateCell.value.slice(0, 7) : null;
    const bucket = month ? perMonth.get(month) : undefined;
    if (isIncome) {
      income.push(value);
      bucket?.push(value);
    } else {
      expense.push(value);
      bucket?.push(`-${value}`);
      if (month === thisMonth) monthExpense.push(value);
      const key = roles.category ? categoryKey(row.cells[roles.category]) : null;
      perCategory.set(key, [...(perCategory.get(key) ?? []), value]);
    }
  }

  const totalIncome = sumDecimals(income);
  const totalExpense = sumDecimals(expense);
  return {
    income: totalIncome,
    expense: totalExpense,
    balance: subtractDecimals(totalIncome, totalExpense),
    entries: income.length + expense.length,
    monthExpense: sumDecimals(monthExpense),
    byCategory: [...perCategory.entries()]
      .map(([key, values]) => ({ key, amount: sumDecimals(values) }))
      .sort((a, b) => compareDecimals(b.amount, a.amount)),
    byMonth: monthKeys.map((m) => ({
      month: m,
      net: sumDecimals((perMonth.get(m) ?? []).map((v) => v.replace(/^--/, ''))),
    })),
  };
}
