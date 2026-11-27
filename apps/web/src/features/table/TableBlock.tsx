import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AtSign,
  CalendarDays,
  CircleDot,
  Coins,
  FileDown,
  Hash,
  Link2,
  Maximize2,
  Plus,
  SlidersHorizontal,
  SquareCheck,
  TableProperties,
  Tag,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import {
  detectWallet,
  exportDataset,
  formatCell,
  parseCell,
  parseDelimited,
  type DataLocale,
} from '@panoya/data';
import type { TablePayload } from '@panoya/blocks';
import {
  tracksHistory,
  type CellValue,
  type Dataset,
  type DatasetColumn,
  type DatasetRow,
} from '@panoya/domain';
import { useRunCommand, useServices, useStoreQuery } from '../../app/services';
import { BusyNote } from '../../components/BusyNote';
import { CopyButton, useCopy } from '../../components/Copy';
import { MenuButton } from '../../components/Menu';
import { useToast } from '../../components/Toasts';
import { useI18n } from '../../i18n';
import type { BlockViewProps } from '../blocks/types';
import { CellEditor } from './CellEditor';
import { ColumnDialog, type ColumnDialogState } from './ColumnDialog';
import { OptionBadge } from './OptionBadge';
import { RowDialog } from './RowDialog';
import { NumberStats, WalletPanel } from './TableStats';
import {
  columnTypeKey,
  downloadText,
  filterRows,
  isNumericColumn,
  optionCounts,
  safeFilename,
  sortRows,
  type FilterSpec,
  type SortSpec,
} from './tableUtils';

/** Rows drawn at first; more on request. 50 keeps a 2,000-row wallet responsive on slow phones. */
const PAGE = 50;

/** The column type is shown, not asked: one icon before the header label. */
const typeIcon: Record<DatasetColumn['type'], LucideIcon> = {
  text: Type,
  number: Hash,
  decimal: Hash,
  money: Coins,
  boolean: SquareCheck,
  date: CalendarDays,
  category: Tag,
  select: CircleDot,
  email: AtSign,
  url: Link2,
};

/** Header text with unit/currency (written once, not in every cell — datawiz T12). */
function headerLabel(column: DatasetColumn): string {
  const unit = column.type === 'money' ? column.currency : column.unit;
  return unit ? `${column.label} (${unit})` : column.label;
}

export function TableBlock({ block, payload }: BlockViewProps<TablePayload>) {
  const { store, workspace } = useServices();
  const run = useRunCommand();
  const toast = useToast();
  const copy = useCopy();
  const { t, locale } = useI18n();
  const dataLocale = locale as DataLocale;
  const datasetId = payload.datasetId;
  const { data } = useStoreQuery(
    async () => {
      const [dataset, rows] = await Promise.all([
        store.getDataset(datasetId),
        store.getRows(datasetId),
      ]);
      return { dataset, rows };
    },
    (change) => change.ids.has(datasetId),
    [datasetId],
  );
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  // One formatter per locale, not one per cell: 200 rows × money and date columns would otherwise
  // build hundreds of Intl objects on every render (measured: slow entry on a 2,000-row wallet).
  const formatters = useMemo(
    () => ({
      money: new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      date: new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    }),
    [locale],
  );
  const [editing, setEditing] = useState<{
    rowId: string;
    columnId: string;
    initialText?: string;
  } | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [rowDialog, setRowDialog] = useState<string | null>(null);
  const [columnDialog, setColumnDialog] = useState<ColumnDialogState | null>(null);
  /** A large paste can take seconds; BusyNote shows after 400 ms (delayed feedback pattern). */
  const [pasting, setPasting] = useState(false);
  const gridRef = useRef<HTMLTableElement>(null);
  const wasFocused = useRef(false);
  /** Bumped by every programmatic move and every pointer press; a stale move is dropped. */
  const focusTurn = useRef(0);

  const sort: SortSpec = payload.view.sort;
  const filter: FilterSpec = payload.view.filter ?? null;
  const dataset = data?.dataset;
  const allRows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const rows = useMemo(
    () => sortRows(filterRows(allRows, filter), sort, dataset?.columns ?? []),
    [allRows, filter, sort, dataset?.columns],
  );

  if (!data) return <div className="table-loading" aria-busy="true" />;
  if (!dataset || dataset.trashed === 1) {
    return <p className="hint-warn">{t('table.missingDataset')}</p>;
  }

  const columns = dataset.columns;
  const wallet = detectWallet(columns);
  const visible = rows.slice(0, limit);
  const missingCount = rows.reduce(
    (n, r) => n + columns.filter((c) => r.cells[c.id] === undefined).length,
    0,
  );
  // Counts + filter bar only for status columns (history tracked), not every choice column.
  const selectColumns = columns.filter(
    (c) => c.type === 'select' && (c.options ?? []).length > 0 && tracksHistory(c),
  );

  const setView = (view: Partial<TablePayload['view']>) =>
    void run({
      type: 'updateBlock',
      workspaceId: workspace.id,
      id: block.id,
      expectedRevision: block.localRevision,
      payload: { ...payload, view: { ...payload.view, ...view } },
    });

  const toggleSort = (columnId: string) => {
    const next: SortSpec =
      sort?.columnId !== columnId
        ? { columnId, direction: 'asc' }
        : sort.direction === 'asc'
          ? { columnId, direction: 'desc' }
          : null;
    setView({ sort: next });
  };

  const focusCell = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(r, visible.length - 1));
    const cc = Math.max(0, Math.min(c, columns.length - 1));
    setFocus({ r: rr, c: cc });
    const turn = ++focusTurn.current;
    // Focus moves one frame later; if the user pressed on a cell in between, theirs wins.
    requestAnimationFrame(() => {
      if (turn !== focusTurn.current) return;
      gridRef.current?.querySelector<HTMLElement>(`[data-cell="${rr}:${cc}"]`)?.focus();
    });
  };

  const commitCell = async (
    row: DatasetRow,
    column: DatasetColumn,
    value: CellValue,
    move: 'down' | 'right' | 'none',
  ) => {
    setEditing(null);
    const before = row.cells[column.id];
    if (JSON.stringify(before ?? { kind: 'missing' }) !== JSON.stringify(value)) {
      await run({
        type: 'updateCells',
        workspaceId: workspace.id,
        datasetId,
        edits: [{ rowId: row.id, columnId: column.id, value }],
      });
      // The editor is gone, so focus sits on <body> unless the user clicked or tabbed somewhere
      // while the write was running. Then that choice wins: pulling focus back would make the
      // next Enter edit the wrong cell.
      const active = document.activeElement;
      if (active && active !== document.body) return;
    }
    const r = visible.indexOf(row);
    const c = columns.indexOf(column);
    if (move === 'down') focusCell(r + 1, c);
    else if (move === 'right') focusCell(r, c + 1);
    else focusCell(r, c);
  };

  const addRow = async () => {
    // A new row inherits the active filter's choice so it stays visible.
    const cells: Record<string, CellValue> =
      filter && filter.optionId
        ? { [filter.columnId]: { kind: 'select', optionId: filter.optionId } }
        : {};
    const result = await run({
      type: 'addDatasetRows',
      workspaceId: workspace.id,
      datasetId,
      rows: [{ cells }],
    });
    const id = result?.mutation.primary?.id;
    if (id && columns[0]) {
      if (sort) toast.show({ message: t('table.addedSorted') });
      setLimit((l) => Math.max(l, rows.length + 1));
      setEditing({ rowId: id, columnId: columns[0].id });
    }
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (editing || (e.target as HTMLElement).tagName === 'BUTTON') return;
    const { r, c } = focus;
    const row = visible[r];
    const column = columns[c];
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'ArrowDown') focusCell(r + 1, c);
    else if (e.key === 'ArrowUp') focusCell(r - 1, c);
    else if (e.key === 'ArrowRight') focusCell(r, c + 1);
    else if (e.key === 'ArrowLeft') focusCell(r, c - 1);
    else if (mod && e.key.toLowerCase() === 'c' && row && column) {
      void copy({ plain: formatCell(row.cells[column.id], dataLocale, column), format: 'plain' });
    } else if ((e.key === 'Enter' || e.key === 'F2') && row && column) {
      setEditing({ rowId: row.id, columnId: column.id });
    } else if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      row &&
      column &&
      row.cells[column.id]
    ) {
      void commitCell(row, column, { kind: 'missing' }, 'none');
    } else if (
      e.key.length === 1 &&
      !mod &&
      !e.altKey &&
      row &&
      column &&
      column.type !== 'boolean' &&
      column.type !== 'select'
    ) {
      setEditing({ rowId: row.id, columnId: column.id, initialText: e.key });
    } else return;
    e.preventDefault();
  };

  /** Rectangular TSV paste from the focused cell; validated first, then one atomic command. */
  const onPaste = async (e: ClipboardEvent<HTMLElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    // Single values typed into an open cell editor paste normally; rectangles go to the grid.
    if (editing && !/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    if (editing) {
      setEditing(null);
      e.stopPropagation();
    }
    let grid: string[][];
    try {
      grid = parseDelimited(text, { delimiter: '\t' }).rows;
    } catch {
      return;
    }
    const edits: { rowId: string; columnId: string; value: CellValue }[] = [];
    const appendRows: { cells: Record<string, CellValue> }[] = [];
    let invalid = 0;
    grid.forEach((line, i) => {
      const target = visible[focus.r + i];
      const cells: Record<string, CellValue> = {};
      line.forEach((raw, j) => {
        const column = columns[focus.c + j];
        if (!column) return;
        const outcome = parseCell(raw, column, dataLocale);
        if (!outcome.ok) {
          invalid++;
          return;
        }
        if (target) edits.push({ rowId: target.id, columnId: column.id, value: outcome.value });
        else if (outcome.value.kind !== 'missing') cells[column.id] = outcome.value;
      });
      if (!target) appendRows.push({ cells });
    });
    if (invalid > 0) {
      toast.show({ message: t('table.pasteRejected', { count: invalid }), tone: 'error' });
      return;
    }
    if (edits.length || appendRows.length) {
      setPasting(true);
      await run({ type: 'updateCells', workspaceId: workspace.id, datasetId, edits, appendRows });
      setPasting(false);
    }
  };

  const exportCsv = (safe: boolean) => {
    const result = exportDataset(columns, rows, {
      delimiter: dataLocale === 'tr-TR' ? ';' : ',',
      safe,
      bom: true,
    });
    downloadText(safeFilename(dataset.title || t('blockType.table'), 'csv'), result.text);
    toast.show({
      message:
        result.neutralized > 0
          ? t('table.exportNeutralized', { count: result.neutralized })
          : t('table.exported'),
    });
  };

  const renderCell = (cell: CellValue | undefined, column: DatasetColumn) => {
    if (cell === undefined) {
      return (
        <span className="cell-missing" aria-label={t('table.missing')}>
          —
        </span>
      );
    }
    if (cell.kind === 'select') {
      const option = column.options?.find((o) => o.id === cell.optionId);
      return option ? <OptionBadge label={option.label} color={option.color} /> : '—';
    }
    // Money shows the amount only; the currency is written once in the header (T12).
    // Display only: amounts grouped with two decimals (currency is in the header), dates in the
    // reader's format instead of the stored YYYY-MM-DD. Editing and export keep the exact value.
    if (cell.kind === 'money') return formatters.money.format(Number(cell.amount));
    if (cell.kind === 'date') return formatters.date.format(new Date(`${cell.value}T00:00:00Z`));
    return formatCell(cell, dataLocale, column);
  };

  return (
    <div className="table-block">
      <div className="table-head">
        <DatasetTitle dataset={dataset} />
        <div className="block-actions">
          <CopyButton
            getText={() => exportDataset(columns, rows, { delimiter: '\t', lineEnding: '\n' }).text}
            label={t('table.copyTsv')}
            variant="icon"
            disabled={rows.length === 0}
          />
          <MenuButton
            label={t('table.more')}
            items={[
              {
                id: 'addcol',
                label: t('table.addColumn'),
                icon: <TableProperties size={16} />,
                onSelect: () => setColumnDialog({ mode: 'add' }),
              },
              {
                id: 'csv',
                label: t('table.exportCsv'),
                icon: <FileDown size={16} />,
                onSelect: () => exportCsv(true),
              },
              {
                id: 'csvraw',
                label: t('table.exportCsvRaw'),
                icon: <FileDown size={16} />,
                onSelect: () => exportCsv(false),
              },
            ]}
          >
            <SlidersHorizontal size={17} aria-hidden="true" />
          </MenuButton>
        </div>
      </div>

      {wallet && <WalletPanel dataset={dataset} rows={allRows} roles={wallet} />}

      {selectColumns.map((column) => (
        <div
          key={column.id}
          className="status-bar"
          role="group"
          aria-label={t('table.statusOf', { column: column.label })}
        >
          <span className="status-label">{column.label}</span>
          {optionCounts(allRows, column).map(({ optionId, count }) => {
            const option = column.options?.find((o) => o.id === optionId);
            const active = filter?.columnId === column.id && filter.optionId === optionId;
            return (
              <button
                key={optionId ?? 'empty'}
                type="button"
                className={`status-chip${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() =>
                  setView({ filter: active ? null : { columnId: column.id, optionId } })
                }
              >
                <OptionBadge
                  label={option?.label ?? t('table.emptyChoice')}
                  color={option?.color ?? 'gray'}
                  empty={!option}
                />
                <span className="status-count">{count}</span>
              </button>
            );
          })}
        </div>
      ))}
      {filter && (
        <p className="filter-note">
          <span>{t('table.filtered', { shown: rows.length, total: allRows.length })}</span>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setView({ filter: null })}
          >
            <X size={14} aria-hidden="true" />
            <span>{t('table.clearFilter')}</span>
          </button>
        </p>
      )}

      <BusyNote active={pasting} label={t('busy.pasting')} />
      <div className="table-frame">
        <div
          className="table-scroll"
          role="region"
          aria-label={dataset.title || t('blockType.table')}
          tabIndex={-1}
        >
          <table
            ref={gridRef}
            className="grid"
            onKeyDown={onGridKeyDown}
            onPaste={(e) => void onPaste(e)}
            aria-rowcount={rows.length + 1}
          >
            <thead>
              <tr>
                <th scope="col" className="row-head">
                  <span className="sr-only">{t('table.rowNumber')}</span>
                </th>
                {columns.map((column) => {
                  const sorted = sort?.columnId === column.id ? sort.direction : null;
                  const TypeIcon = typeIcon[column.type];
                  return (
                    <th
                      key={column.id}
                      scope="col"
                      className={isNumericColumn(column) ? 'num' : undefined}
                      aria-sort={
                        sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
                      }
                    >
                      <span className="th-inner">
                        <button
                          type="button"
                          className="th-label"
                          title={`${t(columnTypeKey[column.type])} · ${t('table.editColumn')}`}
                          onClick={() => setColumnDialog({ mode: 'edit', columnId: column.id })}
                        >
                          <TypeIcon size={14} aria-hidden="true" className="th-type" />
                          <span>{headerLabel(column)}</span>
                        </button>
                        <button
                          type="button"
                          className={`th-sort${sorted ? ' is-sorted' : ''}`}
                          aria-label={t('table.sortBy', { column: column.label })}
                          onClick={() => toggleSort(column.id)}
                        >
                          {sorted === 'asc' ? (
                            <ArrowUp size={14} />
                          ) : sorted === 'desc' ? (
                            <ArrowDown size={14} />
                          ) : (
                            <ArrowUpDown size={14} />
                          )}
                        </button>
                      </span>
                    </th>
                  );
                })}
                <th scope="col" className="col-add">
                  <button
                    type="button"
                    className="col-add-btn"
                    aria-label={t('table.addColumn')}
                    title={t('table.addColumn')}
                    onClick={() => setColumnDialog({ mode: 'add' })}
                  >
                    <Plus size={16} aria-hidden="true" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row, r) => (
                <tr key={row.id}>
                  <th scope="row" className="row-head">
                    <button
                      type="button"
                      className="row-num"
                      aria-label={t('table.editRow', { n: r + 1 })}
                      onClick={() => setRowDialog(row.id)}
                    >
                      <span className="row-num-n">{r + 1}</span>
                      <Maximize2 size={14} aria-hidden="true" className="row-num-open" />
                    </button>
                  </th>
                  {columns.map((column, c) => {
                    const cell = row.cells[column.id];
                    const isEditing = editing?.rowId === row.id && editing.columnId === column.id;
                    const focused = focus.r === r && focus.c === c;
                    return (
                      <td
                        key={column.id}
                        data-cell={`${r}:${c}`}
                        tabIndex={focused && !isEditing ? 0 : -1}
                        className={`${isNumericColumn(column) ? 'num' : ''}${isEditing ? ' is-editing' : ''}`}
                        onFocus={() => setFocus({ r, c })}
                        onMouseDown={() => {
                          // First click selects; a click on the already selected cell edits.
                          wasFocused.current = focused;
                          focusTurn.current++;
                        }}
                        onDoubleClick={() => setEditing({ rowId: row.id, columnId: column.id })}
                        onClick={() => {
                          if (isEditing) return;
                          // Choices and yes/no open on the first click; on touch screens every
                          // cell does (a second tap to edit is hard to discover).
                          const direct =
                            column.type === 'select' ||
                            column.type === 'boolean' ||
                            window.matchMedia('(pointer: coarse)').matches;
                          if (direct || wasFocused.current)
                            setEditing({ rowId: row.id, columnId: column.id });
                        }}
                      >
                        {isEditing ? (
                          <CellEditor
                            column={column}
                            cell={cell}
                            locale={dataLocale}
                            {...(editing.initialText !== undefined
                              ? { initialText: editing.initialText }
                              : {})}
                            onCommit={(value, move) => void commitCell(row, column, value, move)}
                            onCancel={(reason) => {
                              setEditing(null);
                              if (reason === 'invalid')
                                toast.show({ message: t('table.notSavedInvalid'), tone: 'error' });
                              focusCell(r, c);
                            }}
                          />
                        ) : (
                          renderCell(cell, column)
                        )}
                      </td>
                    );
                  })}
                  <td className="col-add" aria-hidden="true" />
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Ghost row: the page's "Blok ekle" stays the view's single filled primary. */}
        <button type="button" className="table-add-row" onClick={() => void addRow()}>
          <Plus size={16} aria-hidden="true" />
          <span>{t('table.addRow')}</span>
        </button>
      </div>

      <div className="table-foot">
        <span className="muted small">
          {missingCount > 0
            ? t('table.summary', { rows: rows.length, missing: missingCount })
            : t('table.rows', { count: rows.length })}
          {sort ? ` · ${t('table.sortedView')}` : ''}
        </span>
        {rows.length > limit && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setLimit((l) => l + PAGE)}
          >
            {t('table.showMore', { count: Math.min(PAGE, rows.length - limit) })}
          </button>
        )}
      </div>

      {!wallet && <NumberStats columns={columns} rows={rows} locale={dataLocale} />}

      {rowDialog && (
        <RowDialog
          dataset={dataset}
          row={allRows.find((r) => r.id === rowDialog) ?? null}
          locale={dataLocale}
          onClose={() => setRowDialog(null)}
        />
      )}
      {columnDialog && (
        <ColumnDialog
          dataset={dataset}
          rows={allRows}
          state={columnDialog}
          locale={dataLocale}
          onClose={() => setColumnDialog(null)}
        />
      )}
    </div>
  );
}

function DatasetTitle({ dataset }: { dataset: Dataset }) {
  const { t } = useI18n();
  const { workspace } = useServices();
  const run = useRunCommand();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = async () => {
    if (draft === null) return;
    const name = draft.trim();
    if (name !== dataset.title)
      await run({
        type: 'rename',
        workspaceId: workspace.id,
        kind: 'dataset',
        id: dataset.id,
        name,
      });
    setDraft(null);
  };
  return (
    <input
      className="input input-quiet table-title"
      aria-label={t('table.title')}
      placeholder={t('table.title')}
      value={draft ?? dataset.title}
      maxLength={200}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
      }}
    />
  );
}
