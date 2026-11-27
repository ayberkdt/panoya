import { useId, useMemo, useRef, useState } from 'react';
import {
  buildImport,
  CsvError,
  CSV_LIMITS,
  previewImport,
  type DataLocale,
  type Delimiter,
  type ImportPreview,
} from '@panoya/data';
import type { ColumnType, Placement } from '@panoya/domain';
import { useRunCommand, useServices } from '../../app/services';
import { BusyNote } from '../../components/BusyNote';
import { Dialog } from '../../components/Dialog';
import { useI18n } from '../../i18n';
import { presetOptions } from './ColumnDialog';
import { COLUMN_TYPE_ORDER, columnTypeKey } from './tableUtils';

const PREVIEW_ROWS = 8;

interface Props {
  open: boolean;
  pageId: string;
  placement: Placement;
  onClose: () => void;
  onCreated: (blockId: string) => void;
}

/**
 * Create a table: empty, or from pasted text / a CSV file (spec 10). Delimiter and column types
 * are suggestions the user confirms; the number format is asked only when ambiguous. Nothing is
 * written until "Create" and the import is one atomic command (cancel leaves no partial dataset).
 */
export function ImportDialog({ open, pageId, placement, onClose, onCreated }: Props) {
  const { t, locale } = useI18n();
  const { workspace } = useServices();
  const run = useRunCommand();
  const ids = { text: useId(), file: useId(), delim: useId(), locale: useId(), header: useId() };
  const [source, setSource] = useState<{ text: string; filename: string | null }>({
    text: '',
    filename: null,
  });
  const [delimiter, setDelimiter] = useState<Delimiter | 'auto'>('auto');
  const [numberLocale, setNumberLocale] = useState<DataLocale>(locale as DataLocale);
  const [hasHeader, setHasHeader] = useState(true);
  const [types, setTypes] = useState<Record<number, ColumnType>>({});
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo((): { preview: ImportPreview | null; error: string | null } => {
    if (!source.text.trim()) return { preview: null, error: null };
    try {
      const preview = previewImport(source.text, {
        ...(delimiter === 'auto' ? {} : { delimiter }),
        hasHeader,
        emptyLabel: (i) => t('table.columnN', { n: i }),
        locale: numberLocale,
      });
      if (preview.cellCount > CSV_LIMITS.cells)
        return { preview: null, error: t('table.import.tooManyCells', { max: CSV_LIMITS.cells }) };
      return { preview, error: null };
    } catch (e) {
      if (e instanceof CsvError) {
        return {
          preview: null,
          error:
            e.code === 'unterminatedQuote'
              ? t('table.import.unterminated', { line: e.line })
              : e.code === 'tooLarge'
                ? t('table.import.tooLarge')
                : null,
        };
      }
      return { preview: null, error: t('error.generic') };
    }
  }, [source.text, delimiter, hasHeader, numberLocale, t]);

  const preview = parsed.preview;
  const plan = useMemo(() => {
    if (!preview) return null;
    const schema = preview.headers.map((label, i) => ({
      label,
      type: types[i] ?? preview.suggestedTypes[i] ?? 'text',
      currency: workspace.baseCurrency,
    }));
    return buildImport(preview, schema, numberLocale, (i) => `c${i + 1}`);
  }, [preview, types, numberLocale, workspace.baseCurrency]);

  const reset = () => {
    setSource({ text: '', filename: null });
    setTypes({});
    setDelimiter('auto');
    setHasHeader(true);
  };

  const close = () => {
    reset();
    onClose();
  };

  /** Ready-made status-tracking table: title, status (with history), note, date. */
  const createTracker = async () => {
    setBusy(true);
    const result = await run({
      type: 'createTableBlock',
      workspaceId: workspace.id,
      pageId,
      placement,
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
      source: {
        kind: 'manual',
        filename: null,
        delimiter: null,
        locale: null,
        importedAt: null,
        original: null,
      },
    });
    setBusy(false);
    if (result?.mutation.primary) {
      reset();
      onCreated(result.mutation.primary.id);
    }
  };

  const create = async () => {
    setBusy(true);
    const title = source.filename?.replace(/\.(csv|tsv|txt)$/i, '') ?? '';
    const command =
      plan && preview
        ? {
            type: 'createTableBlock' as const,
            workspaceId: workspace.id,
            pageId,
            placement,
            title,
            columns: plan.columns,
            rows: plan.rows,
            source: {
              kind: source.filename ? ('csv' as const) : ('paste' as const),
              filename: source.filename,
              delimiter: preview.delimiter,
              locale: numberLocale,
              importedAt: new Date().toISOString(),
              original: source.text,
            },
          }
        : {
            type: 'createTableBlock' as const,
            workspaceId: workspace.id,
            pageId,
            placement,
            title: '',
            columns: [
              {
                id: 'c1',
                label: t('table.defaultName'),
                type: 'text' as const,
                unit: null,
                currency: null,
              },
              {
                id: 'c2',
                label: t('table.defaultValue'),
                type: 'number' as const,
                unit: null,
                currency: null,
              },
            ],
            rows: [{ cells: {} }, { cells: {} }, { cells: {} }],
            source: {
              kind: 'manual' as const,
              filename: null,
              delimiter: null,
              locale: null,
              importedAt: null,
              original: null,
            },
          };
    const result = await run(command);
    setBusy(false);
    if (result?.mutation.primary) {
      reset();
      onCreated(result.mutation.primary.id);
    }
  };

  const problems = plan?.problems ?? [];
  const canCreate = !busy && !parsed.error && problems.length === 0;

  return (
    <Dialog
      open={open}
      title={t('table.import.title')}
      onClose={close}
      footer={
        <>
          {!preview && (
            <button
              type="button"
              className="btn btn-ghost footer-start"
              disabled={busy}
              onClick={() => void createTracker()}
            >
              {t('table.tracker.create')}
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={close}>
            {t('dialog.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canCreate}
            onClick={() => void create()}
          >
            {preview
              ? t('table.import.create', { rows: preview.body.length })
              : t('table.import.createEmpty')}
          </button>
        </>
      }
    >
      <p className="muted">{t('table.import.hint')}</p>
      <BusyNote active={busy} label={t('busy.creatingTable')} />
      <label htmlFor={ids.text} className="sr-only">
        {t('table.import.paste')}
      </label>
      <textarea
        id={ids.text}
        className="input import-text"
        rows={5}
        placeholder={t('table.import.paste')}
        value={source.text}
        spellCheck={false}
        onChange={(e) => setSource({ text: e.target.value, filename: null })}
      />
      <div className="field-row">
        <input
          ref={fileRef}
          id={ids.file}
          type="file"
          accept=".csv,.tsv,.txt,text/csv,text/plain"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > CSV_LIMITS.bytes) {
              setFileError(t('table.import.tooLarge'));
              return;
            }
            setFileError(null);
            setSource({ text: await file.text(), filename: file.name });
          }}
        />
        <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
          {t('table.import.chooseFile')}
        </button>
        {source.filename && <span className="muted small">{source.filename}</span>}
      </div>

      {fileError && (
        <p className="hint-warn" role="alert">
          {fileError}
        </p>
      )}
      {parsed.error && (
        <p className="hint-warn" role="alert">
          {parsed.error}
        </p>
      )}

      {preview && (
        <>
          <div className="import-options">
            <label htmlFor={ids.delim}>{t('table.import.delimiter')}</label>
            <select
              id={ids.delim}
              className="input"
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value as Delimiter | 'auto')}
            >
              <option value="auto">
                {t('table.import.auto', {
                  found: preview.delimiter === '\t' ? 'Tab' : preview.delimiter,
                })}
              </option>
              <option value=",">,</option>
              <option value=";">;</option>
              <option value={'\t'}>Tab</option>
            </select>
            <label htmlFor={ids.locale}>{t('table.import.numbers')}</label>
            <select
              id={ids.locale}
              className="input"
              value={numberLocale}
              onChange={(e) => setNumberLocale(e.target.value as DataLocale)}
            >
              <option value="tr-TR">1.234,56 (tr-TR)</option>
              <option value="en-US">1,234.56 (en-US)</option>
            </select>
            <label className="check-row">
              <input
                id={ids.header}
                type="checkbox"
                className="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
              />
              <span>{t('table.import.header')}</span>
            </label>
          </div>
          {preview.numberLocale === 'ambiguous' && (
            <p className="hint-warn">{t('table.import.ambiguous')}</p>
          )}
          {preview.numberLocale === 'en-US' && numberLocale !== 'en-US' && (
            <p className="hint-warn">{t('table.import.looksEnglish')}</p>
          )}
          {preview.raggedRows.length > 0 && (
            <p className="hint-warn">
              {t('table.import.ragged', { count: preview.raggedRows.length })}
            </p>
          )}

          <div className="table-scroll import-preview">
            <table className="grid">
              <thead>
                <tr>
                  {preview.headers.map((h, i) => (
                    <th key={i} scope="col">
                      <span className="th-stack">
                        <span>{h}</span>
                        <select
                          className="input input-small"
                          aria-label={t('table.import.typeOf', { column: h })}
                          value={types[i] ?? preview.suggestedTypes[i] ?? 'text'}
                          onChange={(e) =>
                            setTypes((prev) => ({ ...prev, [i]: e.target.value as ColumnType }))
                          }
                        >
                          {COLUMN_TYPE_ORDER.map((ct) => (
                            <option key={ct} value={ct}>
                              {t(columnTypeKey[ct])}
                            </option>
                          ))}
                        </select>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.body.slice(0, PREVIEW_ROWS).map((row, r) => (
                  <tr key={r}>
                    {preview.headers.map((_, c) => {
                      const bad = problems.some((p) => p.row === r && p.column === c);
                      const value = row[c] ?? '';
                      const type = types[c] ?? preview.suggestedTypes[c] ?? 'text';
                      const numeric = type === 'number' || type === 'decimal' || type === 'money';
                      return (
                        <td
                          key={c}
                          className={
                            [bad ? 'cell-bad' : '', numeric ? 'num' : ''].join(' ').trim() ||
                            undefined
                          }
                        >
                          {value === '' ? (
                            <span className="cell-missing" aria-label={t('table.missing')}>
                              —
                            </span>
                          ) : (
                            value
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            {t('table.import.counts', {
              rows: preview.body.length,
              columns: preview.headers.length,
            })}
          </p>
          {problems.length > 0 && (
            <div className="hint-warn" role="alert">
              <p>{t('table.import.problems', { count: problems.length })}</p>
              <ul className="problem-list">
                {problems.slice(0, 5).map((p, i) => (
                  <li key={i}>
                    {t('table.import.problemAt', {
                      row: p.row + 1,
                      column: preview.headers[p.column] ?? '',
                      value: p.raw,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
