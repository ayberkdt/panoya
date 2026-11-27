import { Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { convertCells, type DataLocale } from '@panoya/data';
import {
  optionColors,
  STATUS_PRESETS,
  type ColumnType,
  type Dataset,
  type DatasetRow,
  type OptionColor,
  type SelectOption,
} from '@panoya/domain';
import { useRunCommand, useServices } from '../../app/services';
import { ConfirmDialog, Dialog } from '../../components/Dialog';
import { useI18n, type MessageKey } from '../../i18n';
import { OptionBadge } from './OptionBadge';
import { ColumnTypeOptions } from './ColumnTypeOptions';
import { newColumnId, newOptionId } from './tableUtils';

export type ColumnDialogState = { mode: 'add' } | { mode: 'edit'; columnId: string };

export const colorKey: Record<OptionColor, MessageKey> = {
  gray: 'color.gray',
  brown: 'color.brown',
  orange: 'color.orange',
  yellow: 'color.yellow',
  green: 'color.green',
  blue: 'color.blue',
  purple: 'color.purple',
  pink: 'color.pink',
  red: 'color.red',
};

type PresetName = keyof typeof STATUS_PRESETS;
const PRESETS: PresetName[] = ['task', 'mail', 'decision'];

/** Localized copy of a preset (ids and colours stay stable). */
export function presetOptions(name: PresetName, t: (key: MessageKey) => string): SelectOption[] {
  return STATUS_PRESETS[name].map((o) => ({ ...o, label: t(`preset.${o.id}` as MessageKey) }));
}

/**
 * Add / rename / retype / delete a column. Select columns edit their options (label + colour) and
 * whether changes are kept in row history. A type change previews unconvertible values; the user
 * chooses to keep them as missing or cancel (spec 10: no silent coercion).
 */
export function ColumnDialog({
  dataset,
  rows,
  state,
  locale,
  onClose,
}: {
  dataset: Dataset;
  rows: DatasetRow[];
  state: ColumnDialogState;
  locale: DataLocale;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { workspace } = useServices();
  const run = useRunCommand();
  const ids = { label: useId(), type: useId(), unit: useId(), currency: useId(), history: useId() };
  const existing =
    state.mode === 'edit' ? dataset.columns.find((c) => c.id === state.columnId) : undefined;
  const [label, setLabel] = useState(existing?.label ?? '');
  const [type, setType] = useState<ColumnType>(existing?.type ?? 'text');
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const [currency, setCurrency] = useState(existing?.currency ?? workspace.baseCurrency);
  const [options, setOptions] = useState<SelectOption[] | null>(existing?.options ?? null);
  const [trackHistory, setTrackHistory] = useState(existing?.trackHistory ?? true);
  const [acceptMissing, setAcceptMissing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const typeChanged =
    !!existing && (type !== existing.type || (type === 'money' && currency !== existing.currency));
  const preview = useMemo(() => {
    if (!existing || !typeChanged) return null;
    return convertCells(
      rows.map((r) => ({ id: r.id, cell: r.cells[existing.id] })),
      {
        type,
        currency: type === 'money' ? currency : null,
        options: type === 'select' ? (options ?? []) : [],
      },
      locale,
      existing,
    );
  }, [existing, typeChanged, type, currency, options, rows, locale]);

  // Options shown in the editor: edited ones, else derived from data on conversion, else a preset.
  const shownOptions =
    options ?? preview?.options ?? (type === 'select' ? presetOptions('task', t) : []);
  const editOptions = (next: SelectOption[]) => setOptions(next);
  const removedInUse =
    existing?.type === 'select' && type === 'select'
      ? rows.filter((r) => {
          const cell = r.cells[existing.id];
          return cell?.kind === 'select' && !shownOptions.some((o) => o.id === cell.optionId);
        }).length
      : 0;

  const labelsUnique =
    new Set(shownOptions.map((o) => o.label.trim().toLocaleLowerCase('tr-TR'))).size ===
    shownOptions.length;
  const optionsValid =
    type !== 'select' ||
    (shownOptions.length > 0 && shownOptions.every((o) => o.label.trim() !== '') && labelsUnique);
  const currencyValid = type !== 'money' || /^[A-Z]{3}$/.test(currency);
  const canSave =
    label.trim() !== '' &&
    currencyValid &&
    optionsValid &&
    (!preview || preview.invalid.length === 0 || acceptMissing);

  const cleanOptions = () => shownOptions.map((o) => ({ ...o, label: o.label.trim() }));

  const save = async () => {
    if (!canSave) return;
    const unitValue = unit.trim() || null;
    if (state.mode === 'add') {
      const ok = await run({
        type: 'addColumn',
        workspaceId: workspace.id,
        datasetId: dataset.id,
        column: {
          id: newColumnId(dataset.columns),
          label: label.trim(),
          type,
          unit: unitValue,
          currency: type === 'money' ? currency : null,
          ...(type === 'select' ? { options: cleanOptions(), trackHistory } : {}),
        },
      });
      if (ok) onClose();
      return;
    }
    if (!existing) return;
    if (typeChanged) {
      const ok = await run({
        type: 'setColumnType',
        workspaceId: workspace.id,
        datasetId: dataset.id,
        columnId: existing.id,
        columnType: type,
        ...(type === 'money' ? { currency } : {}),
        ...(type === 'select' ? { options: cleanOptions() } : {}),
        values: preview?.values ?? {},
        invalidAs: acceptMissing ? 'missing' : 'reject',
      });
      if (!ok) return;
    }
    const optionsChanged =
      type === 'select' &&
      !typeChanged &&
      JSON.stringify(cleanOptions()) !== JSON.stringify(existing.options ?? []);
    const historyChanged = type === 'select' && trackHistory !== (existing.trackHistory ?? true);
    if (
      label.trim() !== existing.label ||
      unitValue !== existing.unit ||
      optionsChanged ||
      historyChanged
    ) {
      const ok = await run({
        type: 'updateColumn',
        workspaceId: workspace.id,
        datasetId: dataset.id,
        columnId: existing.id,
        label: label.trim(),
        unit: unitValue,
        ...(optionsChanged ? { options: cleanOptions() } : {}),
        ...(type === 'select' ? { trackHistory } : {}),
      });
      if (!ok) return;
    }
    onClose();
  };

  return (
    <>
      <Dialog
        open
        title={state.mode === 'add' ? t('table.addColumn') : t('table.editColumn')}
        onClose={onClose}
        footer={
          <>
            {existing && dataset.columns.length > 1 && (
              <button
                type="button"
                className="btn btn-ghost btn-danger-text footer-start"
                onClick={() => setConfirmDelete(true)}
              >
                {t('table.deleteColumn')}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              {t('dialog.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canSave}
              onClick={() => void save()}
            >
              {t('table.saveColumn')}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label htmlFor={ids.label}>{t('table.columnName')}</label>
          <input
            id={ids.label}
            className="input"
            value={label}
            maxLength={200}
            autoFocus
            onChange={(e) => setLabel(e.target.value)}
          />
          <label htmlFor={ids.type}>{t('table.columnType')}</label>
          <select
            id={ids.type}
            className="input"
            value={type}
            onChange={(e) => setType(e.target.value as ColumnType)}
          >
            <ColumnTypeOptions />
          </select>
          {type === 'money' && (
            <>
              <label htmlFor={ids.currency}>{t('table.currency')}</label>
              <input
                id={ids.currency}
                className="input"
                value={currency}
                maxLength={3}
                aria-invalid={!currencyValid}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </>
          )}
          {(type === 'number' || type === 'decimal') && (
            <>
              <label htmlFor={ids.unit}>{t('table.unit')}</label>
              <input
                id={ids.unit}
                className="input"
                value={unit}
                maxLength={40}
                onChange={(e) => setUnit(e.target.value)}
              />
            </>
          )}
        </div>

        {type === 'select' && (
          <fieldset className="options-editor">
            <legend>{t('table.options')}</legend>
            <div className="preset-row">
              <span className="muted small">{t('table.presets')}</span>
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => editOptions(presetOptions(p, t))}
                >
                  {t(`table.preset.${p}` as MessageKey)}
                </button>
              ))}
            </div>
            <ul className="option-list">
              {shownOptions.map((option, i) => (
                <li key={option.id} className="option-row">
                  <OptionBadge label={option.label || '…'} color={option.color} />
                  <input
                    className="input input-small"
                    aria-label={t('table.optionLabel', { n: i + 1 })}
                    value={option.label}
                    maxLength={100}
                    onChange={(e) =>
                      editOptions(
                        shownOptions.map((o) =>
                          o.id === option.id ? { ...o, label: e.target.value } : o,
                        ),
                      )
                    }
                  />
                  <select
                    className="input input-small"
                    aria-label={t('table.optionColor', { n: i + 1 })}
                    value={option.color}
                    onChange={(e) =>
                      editOptions(
                        shownOptions.map((o) =>
                          o.id === option.id ? { ...o, color: e.target.value as OptionColor } : o,
                        ),
                      )
                    }
                  >
                    {optionColors.map((c) => (
                      <option key={c} value={c}>
                        {t(colorKey[c])}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={t('table.removeOption', { label: option.label })}
                    disabled={shownOptions.length === 1}
                    onClick={() => editOptions(shownOptions.filter((o) => o.id !== option.id))}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() =>
                editOptions([
                  ...shownOptions,
                  {
                    id: newOptionId(shownOptions),
                    label: '',
                    color: optionColors[shownOptions.length % optionColors.length] as OptionColor,
                  },
                ])
              }
            >
              <Plus size={16} aria-hidden="true" />
              <span>{t('table.addOption')}</span>
            </button>
            {!labelsUnique && <p className="field-error">{t('table.optionsDuplicate')}</p>}
            {removedInUse > 0 && (
              <p className="hint-warn">{t('table.optionsRemovedInUse', { count: removedInUse })}</p>
            )}
            <label className="check-row" htmlFor={ids.history}>
              <input
                id={ids.history}
                type="checkbox"
                className="checkbox"
                checked={trackHistory}
                onChange={(e) => setTrackHistory(e.target.checked)}
              />
              <span>{t('table.trackHistory')}</span>
            </label>
          </fieldset>
        )}

        {preview && preview.invalid.length > 0 && (
          <div className="hint-warn">
            <p>{t('table.convertInvalid', { count: preview.invalid.length })}</p>
            <label className="check-row">
              <input
                type="checkbox"
                className="checkbox"
                checked={acceptMissing}
                onChange={(e) => setAcceptMissing(e.target.checked)}
              />
              <span>{t('table.convertAsMissing')}</span>
            </label>
          </div>
        )}
      </Dialog>
      {existing && (
        <ConfirmDialog
          open={confirmDelete}
          title={t('table.deleteColumn')}
          message={t('table.deleteColumnConfirm', {
            name: existing.label,
            count: rows.filter((r) => r.cells[existing.id] !== undefined).length,
          })}
          confirmLabel={t('table.deleteColumn')}
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            void run({
              type: 'deleteColumn',
              workspaceId: workspace.id,
              datasetId: dataset.id,
              columnId: existing.id,
            }).then((ok) => ok && onClose());
          }}
        />
      )}
    </>
  );
}
