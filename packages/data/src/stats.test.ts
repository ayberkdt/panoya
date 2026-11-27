import { describe, expect, it } from 'vitest';
import type { CellValue, DatasetColumn, DatasetRow } from '@panoya/domain';
import {
  detectWallet,
  summarizeColumn,
  summarizeWallet,
  sumDecimals,
  subtractDecimals,
} from './stats';

const col = (c: Partial<DatasetColumn> & Pick<DatasetColumn, 'id' | 'type'>): DatasetColumn => ({
  label: c.id,
  unit: null,
  currency: null,
  ...c,
});

let n = 0;
const row = (cells: Record<string, CellValue>): DatasetRow =>
  ({ id: `r${++n}`, cells }) as unknown as DatasetRow;

const money = (amount: string): CellValue => ({ kind: 'money', amount, currency: 'TRY' });
const sel = (optionId: string): CellValue => ({ kind: 'select', optionId });
const date = (value: string): CellValue => ({ kind: 'date', value });

const walletColumns: DatasetColumn[] = [
  col({ id: 'date', type: 'date' }),
  col({ id: 'desc', type: 'text' }),
  col({
    id: 'cat',
    type: 'select',
    options: [
      { id: 'market', label: 'Market', color: 'orange' },
      { id: 'bill', label: 'Fatura', color: 'blue' },
    ],
  }),
  col({
    id: 'flow',
    type: 'select',
    options: [
      { id: 'in', label: 'Gelir', color: 'green' },
      { id: 'out', label: 'Gider', color: 'red' },
    ],
  }),
  col({ id: 'amt', type: 'money', currency: 'TRY' }),
];

describe('exact decimal arithmetic', () => {
  it('adds without float error', () => {
    expect(sumDecimals(['0.1', '0.2'])).toBe('0.3');
    expect(sumDecimals(['1250', '87.5', '-0.25'])).toBe('1337.25');
    expect(sumDecimals([])).toBe('0');
    expect(subtractDecimals('100', '100.5')).toBe('-0.5');
  });
});

describe('column summary', () => {
  it('sums, averages and finds the range of a money column', () => {
    const c = col({ id: 'amt', type: 'money' });
    const s = summarizeColumn([row({ amt: money('10') }), row({ amt: money('20.5') }), row({})], c);
    expect(s).toEqual({ count: 2, sum: '30.5', mean: '15.25', min: '10', max: '20.5' });
  });

  it('rounds the mean half away from zero to two decimals', () => {
    const c = col({ id: 'v', type: 'number' });
    const rows = [1, 1, 2].map((v) => row({ v: { kind: 'number', value: v } }));
    expect(summarizeColumn(rows, c)?.mean).toBe('1.33');
  });

  it('returns null for an empty column', () => {
    expect(summarizeColumn([row({})], col({ id: 'v', type: 'number' }))).toBeNull();
  });
});

describe('wallet', () => {
  it('is recognised from the columns, Turkish or English labels', () => {
    expect(detectWallet(walletColumns)).toEqual({
      amount: 'amt',
      flow: 'flow',
      income: ['in'],
      expense: ['out'],
      category: 'cat',
      date: 'date',
    });
    const english = walletColumns.map((c) =>
      c.id === 'flow'
        ? {
            ...c,
            options: [
              { id: 'a', label: 'Income', color: 'green' as const },
              { id: 'b', label: 'Expense', color: 'red' as const },
            ],
          }
        : c,
    );
    expect(detectWallet(english)?.income).toEqual(['a']);
    expect(detectWallet(walletColumns.filter((c) => c.id !== 'amt'))).toBeNull();
  });

  it('computes balance, monthly expense, categories and months', () => {
    const roles = detectWallet(walletColumns)!;
    const rows = [
      row({ date: date('2026-11-01'), flow: sel('in'), amt: money('30000') }),
      row({
        date: date('2026-11-03'),
        flow: sel('out'),
        cat: sel('market'),
        amt: money('1250.40'),
      }),
      row({ date: date('2026-11-10'), flow: sel('out'), cat: sel('bill'), amt: money('840') }),
      row({ date: date('2026-10-20'), flow: sel('out'), cat: sel('market'), amt: money('900') }),
      row({ flow: sel('out'), amt: money('100') }), // no date, no category
      row({ amt: money('5') }), // no direction: ignored
    ];
    const s = summarizeWallet(rows, roles, '2026-11-27', 3);
    expect(s.income).toBe('30000');
    expect(s.expense).toBe('3090.4');
    expect(s.balance).toBe('26909.6');
    expect(s.entries).toBe(5);
    expect(s.monthExpense).toBe('2090.4');
    expect(s.byCategory).toEqual([
      { key: 'market', amount: '2150.4' },
      { key: 'bill', amount: '840' },
      { key: null, amount: '100' },
    ]);
    expect(s.byMonth).toEqual([
      { month: '2026-09', net: '0' },
      { month: '2026-10', net: '-900' },
      { month: '2026-11', net: '27909.6' },
    ]);
  });
});
