import { useState } from 'react';
import { formatCell, parseCell, type DataLocale } from '@panoya/data';
import type { CellValue, DatasetColumn } from '@panoya/domain';
import { useI18n, type MessageKey } from '../../i18n';

const reasonKey: Record<string, MessageKey> = {
  number: 'table.invalid.number',
  date: 'table.invalid.date',
  boolean: 'table.invalid.boolean',
  currency: 'table.invalid.currency',
  tooLong: 'table.invalid.tooLong',
  email: 'table.invalid.email',
  url: 'table.invalid.url',
  option: 'table.invalid.option',
};

export function cellInputText(
  cell: CellValue | undefined,
  locale: DataLocale,
  column?: DatasetColumn,
): string {
  if (cell?.kind === 'money') return formatCell({ kind: 'decimal', value: cell.amount }, locale);
  return formatCell(cell, locale, column);
}

interface Props {
  column: DatasetColumn;
  cell: CellValue | undefined;
  locale: DataLocale;
  initialText?: string;
  onCommit: (value: CellValue, move: 'down' | 'right' | 'none') => void;
  /** `invalid`: focus left while the text did not parse (caller tells the user it was not saved). */
  onCancel: (reason?: 'invalid') => void;
  autoFocus?: boolean;
  id?: string;
}

/**
 * Typed cell input: parses with the column type and UI locale; invalid text is never committed,
 * the reason is shown in place (spec 10: no silent coercion).
 */
export function CellEditor({
  column,
  cell,
  locale,
  initialText,
  onCommit,
  onCancel,
  autoFocus = true,
  id,
}: Props) {
  const { t } = useI18n();
  const [text, setText] = useState(initialText ?? cellInputText(cell, locale, column));
  const [error, setError] = useState<string | null>(null);

  const commit = (move: 'down' | 'right' | 'none') => {
    const outcome = parseCell(text, column, locale);
    if (!outcome.ok) {
      setError(t(reasonKey[outcome.reason] ?? 'table.invalid.number'));
      return false;
    }
    onCommit(outcome.value, move);
    return true;
  };

  if (column.type === 'select') {
    return (
      <select
        id={id}
        className="cell-input"
        autoFocus={autoFocus}
        defaultValue={cell?.kind === 'select' ? cell.optionId : ''}
        onChange={(e) =>
          onCommit(
            e.target.value === ''
              ? { kind: 'missing' }
              : { kind: 'select', optionId: e.target.value },
            'none',
          )
        }
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        onBlur={() => onCancel()}
        aria-label={column.label}
      >
        <option value="">—</option>
        {(column.options ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (column.type === 'boolean') {
    return (
      <select
        id={id}
        className="cell-input"
        autoFocus={autoFocus}
        defaultValue={cell?.kind === 'boolean' ? String(cell.value) : ''}
        onChange={(e) =>
          onCommit(
            e.target.value === ''
              ? { kind: 'missing' }
              : { kind: 'boolean', value: e.target.value === 'true' },
            'none',
          )
        }
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        onBlur={() => onCancel()}
        aria-label={column.label}
      >
        <option value="">—</option>
        <option value="true">{t('table.true')}</option>
        <option value="false">{t('table.false')}</option>
      </select>
    );
  }

  return (
    <span className="cell-editor">
      <input
        id={id}
        className="cell-input"
        autoFocus={autoFocus}
        value={text}
        inputMode={
          column.type === 'number' || column.type === 'decimal' || column.type === 'money'
            ? 'decimal'
            : column.type === 'email'
              ? 'email'
              : column.type === 'url'
                ? 'url'
                : 'text'
        }
        aria-label={column.label}
        aria-invalid={error !== null}
        onFocus={(e) => {
          if (initialText === undefined) e.currentTarget.select();
        }}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            commit('down');
          } else if (e.key === 'Tab') {
            if (commit('right')) e.preventDefault();
            else e.preventDefault();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        onBlur={() => {
          if (!commit('none')) onCancel('invalid');
        }}
      />
      {error && (
        <span className="cell-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
