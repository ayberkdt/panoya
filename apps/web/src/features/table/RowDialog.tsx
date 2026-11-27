import { History } from 'lucide-react';
import { useId, useState } from 'react';
import { parseCell, type DataLocale } from '@panoya/data';
import type { CellValue, Dataset, DatasetRow } from '@panoya/domain';
import { useRunCommand, useServices } from '../../app/services';
import { CopyButton } from '../../components/Copy';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { useI18n } from '../../i18n';
import { cellInputText } from './CellEditor';

/**
 * Row edit sheet (spec 10: mobile row editing) with the row's change history ("geriye dönük
 * takip"). All fields are validated before one atomic `updateCells`; deleting moves the row to
 * the trash (undoable).
 */
export function RowDialog({
  dataset,
  row,
  locale,
  onClose,
}: {
  dataset: Dataset;
  row: DatasetRow | null;
  locale: DataLocale;
  onClose: () => void;
}) {
  const { t, formatDateTime } = useI18n();
  const { workspace } = useServices();
  const run = useRunCommand();
  const toast = useToast();
  const baseId = useId();
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      dataset.columns.map((c) => [
        c.id,
        c.type === 'select' ? '' : cellInputText(row?.cells[c.id], locale, c),
      ]),
    ),
  );
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      dataset.columns
        .filter((c) => c.type === 'select')
        .map((c) => {
          const cell = row?.cells[c.id];
          return [c.id, cell?.kind === 'select' ? cell.optionId : ''];
        }),
    ),
  );
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  if (!row) return null;
  const history = [...(row.history ?? [])].reverse();

  const save = async () => {
    const edits: { rowId: string; columnId: string; value: CellValue }[] = [];
    const nextErrors: Record<string, boolean> = {};
    for (const column of dataset.columns) {
      if (column.type === 'select') {
        const optionId = choices[column.id] ?? '';
        edits.push({
          rowId: row.id,
          columnId: column.id,
          value: optionId ? { kind: 'select', optionId } : { kind: 'missing' },
        });
        continue;
      }
      const outcome = parseCell(texts[column.id] ?? '', column, locale);
      if (!outcome.ok) nextErrors[column.id] = true;
      else edits.push({ rowId: row.id, columnId: column.id, value: outcome.value });
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    // Only send cells that actually changed, so history records real changes only.
    const changed = edits.filter(
      (e) =>
        JSON.stringify(row.cells[e.columnId] ?? { kind: 'missing' }) !== JSON.stringify(e.value),
    );
    if (changed.length === 0) return onClose();
    if (
      await run({
        type: 'updateCells',
        workspaceId: workspace.id,
        datasetId: dataset.id,
        edits: changed,
      })
    )
      onClose();
  };

  const remove = async () => {
    const result = await run({
      type: 'trashRows',
      workspaceId: workspace.id,
      datasetId: dataset.id,
      rowIds: [row.id],
    });
    if (result) {
      toast.show({ message: t('table.rowDeleted') });
      onClose();
    }
  };

  return (
    <Dialog
      open
      title={t('table.rowTitle')}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost btn-danger-text footer-start"
            onClick={() => void remove()}
          >
            {t('table.deleteRow')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('dialog.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>
            {t('table.saveRow')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        {dataset.columns.map((column, i) => {
          const id = `${baseId}-${i}`;
          return (
            <div key={column.id} className="form-grid">
              <label htmlFor={id}>
                {column.label}
                {column.type === 'money' && column.currency ? ` (${column.currency})` : ''}
              </label>
              {column.type === 'select' ? (
                <select
                  id={id}
                  className="input"
                  value={choices[column.id] ?? ''}
                  onChange={(e) => setChoices((prev) => ({ ...prev, [column.id]: e.target.value }))}
                >
                  <option value="">—</option>
                  {(column.options ?? []).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="field-row">
                  <input
                    id={id}
                    className="input"
                    type={
                      column.type === 'email' ? 'email' : column.type === 'url' ? 'url' : 'text'
                    }
                    value={texts[column.id] ?? ''}
                    aria-invalid={errors[column.id] === true}
                    inputMode={
                      column.type === 'number' ||
                      column.type === 'decimal' ||
                      column.type === 'money'
                        ? 'decimal'
                        : column.type === 'email'
                          ? 'email'
                          : column.type === 'url'
                            ? 'url'
                            : 'text'
                    }
                    onChange={(e) => setTexts((prev) => ({ ...prev, [column.id]: e.target.value }))}
                  />
                  {(column.type === 'email' || column.type === 'url') &&
                    (texts[column.id] ?? '') !== '' && (
                      <CopyButton
                        getText={() => texts[column.id] ?? ''}
                        label={t('table.copyValue', { column: column.label })}
                        variant="icon"
                      />
                    )}
                </div>
              )}
              {errors[column.id] && <p className="field-error">{t('table.invalidField')}</p>}
            </div>
          );
        })}
      </div>

      <section className="row-history" aria-label={t('table.history')}>
        <h3 className="row-history-title">
          <History size={16} aria-hidden="true" />
          <span>{t('table.history')}</span>
        </h3>
        {history.length === 0 ? (
          <p className="muted small">{t('table.historyEmpty')}</p>
        ) : (
          <ol className="history-list">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <time dateTime={h.at} className="muted small">
                  {formatDateTime(h.at)}
                </time>
                <span>
                  <strong>{h.column}</strong>: {h.from || '—'} → {h.to || '—'}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </Dialog>
  );
}
