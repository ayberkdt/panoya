import type { CellValue, DatasetColumn, OptionColor, SelectOption } from '@panoya/domain';
import type { MessageKey } from '../../i18n';
import { presetOptions } from './ColumnDialog';

type T = (key: MessageKey) => string;

export interface TableTemplate {
  title: string;
  columns: DatasetColumn[];
  rows: { cells: Record<string, CellValue> }[];
}

export const MANUAL_SOURCE = {
  kind: 'manual' as const,
  filename: null,
  delimiter: null,
  locale: null,
  importedAt: null,
  original: null,
};

/** Ready-made status-tracking table: title, status (with history), note, date. */
export function trackerTemplate(t: T): TableTemplate {
  return {
    title: t('table.tracker.title'),
    columns: [
      { id: 'c1', label: t('table.tracker.item'), type: 'text', unit: null, currency: null },
      {
        id: 'c2',
        label: t('table.tracker.status'),
        type: 'select',
        unit: null,
        currency: null,
        options: presetOptions('task', t),
        trackHistory: true,
      },
      { id: 'c3', label: t('table.tracker.note'), type: 'text', unit: null, currency: null },
      { id: 'c4', label: t('table.tracker.date'), type: 'date', unit: null, currency: null },
    ],
    rows: [{ cells: {} }, { cells: {} }, { cells: {} }],
  };
}

const WALLET_CATEGORIES: { id: string; key: MessageKey; color: OptionColor }[] = [
  { id: 'market', key: 'wallet.cat.market', color: 'orange' },
  { id: 'bills', key: 'wallet.cat.bills', color: 'blue' },
  { id: 'rent', key: 'wallet.cat.rent', color: 'brown' },
  { id: 'transport', key: 'wallet.cat.transport', color: 'purple' },
  { id: 'fun', key: 'wallet.cat.fun', color: 'pink' },
  { id: 'salary', key: 'wallet.cat.salary', color: 'green' },
  { id: 'other', key: 'wallet.cat.other', color: 'gray' },
];

export const WALLET_IDS = {
  date: 'w_date',
  note: 'w_note',
  category: 'w_cat',
  flow: 'w_flow',
  amount: 'w_amount',
  income: 'in',
  expense: 'out',
} as const;

/**
 * Wallet: date, description, category, income/expense and amount. The statistics panel finds it
 * from these columns (packages/data detectWallet), so renaming the table keeps it working.
 */
export function walletTemplate(t: T, currency: string): TableTemplate {
  const categories: SelectOption[] = WALLET_CATEGORIES.map((c) => ({
    id: c.id,
    label: t(c.key),
    color: c.color,
  }));
  return {
    title: t('wallet.title'),
    columns: [
      {
        id: WALLET_IDS.date,
        label: t('wallet.col.date'),
        type: 'date',
        unit: null,
        currency: null,
      },
      {
        id: WALLET_IDS.note,
        label: t('wallet.col.note'),
        type: 'text',
        unit: null,
        currency: null,
      },
      {
        id: WALLET_IDS.category,
        label: t('wallet.col.category'),
        type: 'select',
        unit: null,
        currency: null,
        options: categories,
        trackHistory: false,
      },
      {
        id: WALLET_IDS.flow,
        label: t('wallet.col.flow'),
        type: 'select',
        unit: null,
        currency: null,
        options: [
          { id: WALLET_IDS.income, label: t('wallet.income'), color: 'green' },
          { id: WALLET_IDS.expense, label: t('wallet.expense'), color: 'orange' },
        ],
        trackHistory: false,
      },
      { id: WALLET_IDS.amount, label: t('wallet.col.amount'), type: 'money', unit: null, currency },
    ],
    rows: [],
  };
}

/** Wallet currency: Turkish users keep money in lira; otherwise the workspace's base currency. */
export const walletCurrency = (locale: string, base: string) => (locale === 'tr-TR' ? 'TRY' : base);

/** Today as YYYY-MM-DD in the user's time zone (not UTC: late-evening entries stay "today"). */
export function localToday(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
