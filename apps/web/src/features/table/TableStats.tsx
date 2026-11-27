import { Loader2, Minus, Plus, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { useId, useRef, useState, type FormEvent } from 'react';
import {
  isNumericColumn,
  parseCell,
  summarizeColumn,
  summarizeWallet,
  type DataLocale,
  type WalletRoles,
} from '@panoya/data';
import type { CellValue, Dataset, DatasetColumn, DatasetRow } from '@panoya/domain';
import { useRunCommand, useServices } from '../../app/services';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { useI18n } from '../../i18n';
import { localToday } from './templates';

/** Amount for display; the arithmetic itself is exact in packages/data. */
function money(value: string, currency: string | null, locale: string, sign = false): string {
  const n = Number(value);
  if (!currency) {
    return new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      signDisplay: sign ? 'exceptZero' : 'auto',
    }).format(n);
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(n);
}

interface WalletPanelProps {
  dataset: Dataset;
  rows: DatasetRow[];
  roles: WalletRoles;
}

/**
 * Wallet statistics computed from the entries: balance, income, expense (this month too),
 * expense per category as a sorted bar list and the last six months' net as diverging bars.
 * Two buttons add an entry through a four-field form instead of typing into the grid.
 */
export function WalletPanel({ dataset, rows, roles }: WalletPanelProps) {
  const { t, locale } = useI18n();
  const [entry, setEntry] = useState<'income' | 'expense' | null>(null);
  const amountColumn = dataset.columns.find((c) => c.id === roles.amount);
  const categoryColumn = roles.category
    ? dataset.columns.find((c) => c.id === roles.category)
    : undefined;
  const currency = amountColumn?.currency ?? null;
  const today = localToday();
  const s = summarizeWallet(rows, roles, today, 6);
  const fmt = (v: string, sign = false) => money(v, currency, locale, sign);
  const short = (v: string) =>
    new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
      ...(currency ? { style: 'currency' as const, currency } : {}),
    }).format(Number(v));

  const categoryLabel = (key: string | null) => {
    if (key === null) return { label: t('wallet.noCategory'), color: 'gray' };
    const option = categoryColumn?.options?.find((o) => o.id === key);
    return option ? { label: option.label, color: option.color } : { label: key, color: 'gray' };
  };
  const maxCategory = Math.max(...s.byCategory.map((c) => Number(c.amount)), 0);
  const maxMonth = Math.max(...s.byMonth.map((m) => Math.abs(Number(m.net))), 0);
  const monthName = (ym: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(
      new Date(`${ym}-01T00:00:00Z`),
    );
  const negative = s.balance.startsWith('-');

  return (
    <section className="wallet-panel" aria-label={t('wallet.statsLabel')}>
      <div className="wallet-head">
        <div className="kpi kpi-balance">
          <span className="kpi-icon" aria-hidden="true">
            <Wallet size={18} />
          </span>
          <span className="kpi-label">{t('wallet.balance')}</span>
          <span className={`kpi-value${negative ? ' is-negative' : ''}`}>{fmt(s.balance)}</span>
          <span className="kpi-sub">{t('wallet.entries', { count: s.entries })}</span>
        </div>
        <div className="kpi tint-green">
          <span className="kpi-icon" aria-hidden="true">
            <TrendingUp size={18} />
          </span>
          <span className="kpi-label">{t('wallet.totalIncome')}</span>
          <span className="kpi-value">{fmt(s.income)}</span>
        </div>
        <div className="kpi tint-orange">
          <span className="kpi-icon" aria-hidden="true">
            <TrendingDown size={18} />
          </span>
          <span className="kpi-label">{t('wallet.totalExpense')}</span>
          <span className="kpi-value">{fmt(s.expense)}</span>
          <span className="kpi-sub">
            {t('wallet.monthExpense', { amount: fmt(s.monthExpense) })}
          </span>
        </div>
      </div>

      <div className="wallet-actions">
        <button type="button" className="btn btn-primary" onClick={() => setEntry('expense')}>
          <Minus size={16} aria-hidden="true" />
          <span>{t('wallet.addExpense')}</span>
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setEntry('income')}>
          <Plus size={16} aria-hidden="true" />
          <span>{t('wallet.addIncome')}</span>
        </button>
      </div>

      {s.entries === 0 ? (
        <p className="wallet-empty">{t('wallet.empty')}</p>
      ) : (
        <div className="wallet-charts">
          <figure className="chart-card">
            <figcaption className="chart-title">{t('wallet.byCategory')}</figcaption>
            {s.byCategory.length === 0 ? (
              <p className="muted small">{t('wallet.noExpense')}</p>
            ) : (
              <ul className="bar-list">
                {s.byCategory.slice(0, 7).map((c) => {
                  const { label, color } = categoryLabel(c.key);
                  const pct = maxCategory > 0 ? (Number(c.amount) / maxCategory) * 100 : 0;
                  return (
                    <li key={c.key ?? '∅'} className="bar-row">
                      <span className="bar-name">{label}</span>
                      <span className="bar-track" aria-hidden="true">
                        <span className={`bar-fill opt-${color}`} style={{ width: `${pct}%` }} />
                      </span>
                      <span className="bar-value">{fmt(c.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </figure>
          <figure className="chart-card">
            <figcaption className="chart-title">{t('wallet.byMonth')}</figcaption>
            <ol className="month-bars">
              {s.byMonth.map((m) => {
                const value = Number(m.net);
                const pct = maxMonth > 0 ? (Math.abs(value) / maxMonth) * 100 : 0;
                const side = value < 0 ? 'neg' : 'pos';
                return (
                  <li key={m.month} className={`month month-${side}`}>
                    <span className="sr-only">
                      {monthName(m.month)}: {fmt(m.net, true)}
                    </span>
                    <span className="month-half month-up" aria-hidden="true">
                      {side === 'pos' && value !== 0 && (
                        <>
                          <span className="month-value">{short(m.net)}</span>
                          <span className="month-bar" style={{ height: `${pct * 0.78}%` }} />
                        </>
                      )}
                    </span>
                    <span className="month-half month-down" aria-hidden="true">
                      {side === 'neg' && (
                        <>
                          <span className="month-bar" style={{ height: `${pct * 0.78}%` }} />
                          <span className="month-value">{short(m.net)}</span>
                        </>
                      )}
                    </span>
                    <span className="month-name" aria-hidden="true">
                      {monthName(m.month)}
                    </span>
                  </li>
                );
              })}
            </ol>
          </figure>
        </div>
      )}

      {entry && amountColumn && (
        <WalletEntryDialog
          kind={entry}
          dataset={dataset}
          roles={roles}
          amountColumn={amountColumn}
          categoryColumn={categoryColumn}
          onClose={() => setEntry(null)}
        />
      )}
    </section>
  );
}

function WalletEntryDialog({
  kind,
  dataset,
  roles,
  amountColumn,
  categoryColumn,
  onClose,
}: {
  kind: 'income' | 'expense';
  dataset: Dataset;
  roles: WalletRoles;
  amountColumn: DatasetColumn;
  categoryColumn: DatasetColumn | undefined;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const { workspace } = useServices();
  const run = useRunCommand();
  const ids = { amount: useId(), note: useId(), cat: useId(), date: useId(), err: useId() };
  const amountRef = useRef<HTMLInputElement>(null);
  const options = categoryColumn?.options ?? [];
  const defaultCategory =
    kind === 'income'
      ? (options.find((o) => o.id === 'salary') ?? options[0])
      : options.find((o) => o.id !== 'salary');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState(defaultCategory?.id ?? '');
  const [date, setDate] = useState(localToday());
  const [error, setError] = useState<string | null>(null);
  /** Saving can take a moment in a large wallet: the button says so at once (Doherty). */
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const flowId = (kind === 'income' ? roles.income : roles.expense)[0] as string;
  const noteColumn = dataset.columns.find((c) => c.type === 'text');

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (saving) return;
    const parsed = parseCell(amount.replace(/^[-−]/, ''), amountColumn, locale as DataLocale);
    if (!parsed.ok || parsed.value.kind === 'missing') {
      setError(t('wallet.entry.amountInvalid'));
      amountRef.current?.focus();
      return;
    }
    const cells: Record<string, CellValue> = {
      [roles.amount]: parsed.value,
      [roles.flow]: { kind: 'select', optionId: flowId },
    };
    if (roles.date && date) cells[roles.date] = { kind: 'date', value: date };
    if (noteColumn && note.trim()) cells[noteColumn.id] = { kind: 'text', value: note.trim() };
    if (categoryColumn && category)
      cells[categoryColumn.id] = { kind: 'select', optionId: category };
    setSaving(true);
    const result = await run({
      type: 'addDatasetRows',
      workspaceId: workspace.id,
      datasetId: dataset.id,
      rows: [{ cells }],
    });
    setSaving(false);
    if (!result) return;
    const shown =
      parsed.value.kind === 'money'
        ? new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: parsed.value.currency,
          }).format(Number(parsed.value.amount))
        : amount;
    toast.show({
      message: t(kind === 'income' ? 'wallet.addedIncome' : 'wallet.addedExpense', {
        amount: shown,
      }),
    });
    onClose();
  };

  const title = kind === 'income' ? t('wallet.addIncome') : t('wallet.addExpense');
  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      initialFocus={amountRef}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            aria-busy={saving}
            onClick={() => void submit()}
          >
            {saving && <Loader2 size={16} aria-hidden="true" className="spin" />}
            {saving ? t('wallet.entry.saving') : t('wallet.entry.save')}
          </button>
        </>
      }
    >
      <form className="form-grid" onSubmit={(e) => void submit(e)}>
        <label htmlFor={ids.amount}>
          {t('wallet.entry.amount')}
          {amountColumn.currency ? ` (${amountColumn.currency})` : ''}
        </label>
        <input
          ref={amountRef}
          id={ids.amount}
          className="input input-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder={locale === 'tr-TR' ? '0,00' : '0.00'}
          value={amount}
          aria-invalid={error !== null}
          aria-describedby={ids.err}
          onChange={(e) => {
            setAmount(e.target.value);
            setError(null);
          }}
        />
        <p id={ids.err} className="field-error" role="alert">
          {error ?? ''}
        </p>
        {noteColumn && (
          <>
            <label htmlFor={ids.note}>{t('wallet.entry.note')}</label>
            <input
              id={ids.note}
              className="input"
              value={note}
              placeholder={
                kind === 'income' ? t('wallet.entry.notePhIncome') : t('wallet.entry.notePhExpense')
              }
              onChange={(e) => setNote(e.target.value)}
            />
          </>
        )}
        {categoryColumn && options.length > 0 && (
          <>
            <label htmlFor={ids.cat}>{t('wallet.col.category')}</label>
            <select
              id={ids.cat}
              className="input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </>
        )}
        {roles.date && (
          <>
            <label htmlFor={ids.date}>{t('wallet.col.date')}</label>
            <input
              id={ids.date}
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </>
        )}
        {/* Enter in any field saves */}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** Sum, average and range under a table, one line per number/money column. */
export function NumberStats({
  columns,
  rows,
  locale,
}: {
  columns: DatasetColumn[];
  rows: DatasetRow[];
  locale: DataLocale;
}) {
  const { t } = useI18n();
  const items = columns
    .filter(isNumericColumn)
    .map((column) => ({ column, s: summarizeColumn(rows, column) }))
    .filter((x): x is { column: DatasetColumn; s: NonNullable<typeof x.s> } => x.s !== null);
  if (items.length === 0) return null;
  const show = (column: DatasetColumn, v: string) =>
    column.type === 'money'
      ? money(v, column.currency, locale)
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(Number(v));
  return (
    <dl className="stat-strip" aria-label={t('stats.label')}>
      {items.map(({ column, s }) => (
        <div key={column.id} className="stat-group">
          <dt className="stat-col">{column.label}</dt>
          <dd>
            <span className="stat">
              <span className="stat-k">{t('stats.sum')}</span>
              <span className="stat-v">{show(column, s.sum)}</span>
            </span>
            <span className="stat">
              <span className="stat-k">{t('stats.mean')}</span>
              <span className="stat-v">{show(column, s.mean)}</span>
            </span>
            <span className="stat">
              <span className="stat-k">{t('stats.min')}</span>
              <span className="stat-v">{show(column, s.min)}</span>
            </span>
            <span className="stat">
              <span className="stat-k">{t('stats.max')}</span>
              <span className="stat-v">{show(column, s.max)}</span>
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
