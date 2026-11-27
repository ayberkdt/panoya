import { ListChecks, Table2, Wallet } from 'lucide-react';
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
import { ColumnTypeOptions } from './ColumnTypeOptions';
import {
  MANUAL_SOURCE,
  trackerTemplate,
  walletCurrency,
  walletTemplate,
  type TableTemplate,
} from './templates';

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

  /** One-click templates: tracker (status with history) or wallet (income/expense + stats). */
  const createFrom = async (template: TableTemplate) => {
    setBusy(true);
    const result = await run({
      type: 'createTableBlock',
      workspaceId: workspace.id,
      pageId,
      placement,
      ...template,
      source: MANUAL_SOURCE,
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
          <button type="button" className="btn btn-ghost" onClick={close}>
            {t('dialog.cancel')}
          </button>
          {preview && (
            <button
              type="button"
              className="btn btn-primary"
              disabled={!canCreate}
              onClick={() => void create()}
            >
              {t('table.import.create', { rows: preview.body.length })}
            </button>
          )}
        </>
      }
    >
      {!preview && (
        <div className="template-grid" role="group" aria-label={t('table.templates')}>
          <button
            type="button"
            className="template-card tint-gray"
            aria-label={t('table.import.createEmpty')}
            disabled={busy}
            onClick={() => void create()}
          >
            <span className="template-icon" aria-hidden="true">
              <Table2 size={20} />
            </span>
            <span className="template-name">{t('table.template.empty')}</span>
            <span className="template-desc">{t('table.template.emptyDesc')}</span>
          </button>
          <button
            type="button"
            className="template-card tint-blue"
            aria-label={t('table.tracker.create')}
            disabled={busy}
            onClick={() => void createFrom(trackerTemplate(t))}
          >
            <span className="template-icon" aria-hidden="true">
              <ListChecks size={20} />
            </span>
            <span className="template-name">{t('table.template.tracker')}</span>
            <span className="template-desc">{t('table.template.trackerDesc')}</span>
          </button>
          <button
            type="button"
            className="template-card tint-green"
            aria-label={t('wallet.create')}
            disabled={busy}
            onClick={() =>
              void createFrom(walletTemplate(t, walletCurrency(locale, workspace.baseCurrency)))
            }
          >
            <span className="template-icon" aria-hidden="true">
              <Wallet size={20} />
            </span>
            <span className="template-name">{t('wallet.title')}</span>
            <span className="template-desc">{t('table.template.walletDesc')}</span>
          </button>
        </div>
      )}
      <p className="muted import-or">{t('table.import.hint')}</p>
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
                  found:
                    preview.delimiter === '\t'
                      ? t('table.import.delimTab')
                      : preview.delimiter === ';'
                        ? t('table.import.delimSemicolon')
                        : t('table.import.delimComma'),
                })}
              </option>
              <option value=",">{t('table.import.delimComma')}</option>
              <option value=";">{t('table.import.delimSemicolon')}</option>
              <option value={'\t'}>{t('table.import.delimTab')}</option>
            </select>
            <label htmlFor={ids.locale}>{t('table.import.numbers')}</label>
            <select
              id={ids.locale}
              className="input"
              value={numberLocale}
              onChange={(e) => setNumberLocale(e.target.value as DataLocale)}
            >
              <option value="tr-TR">{t('table.import.fmtTr')}</option>
              <option value="en-US">{t('table.import.fmtEn')}</option>
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
                          <ColumnTypeOptions />
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
