import type { ColumnType } from '@panoya/domain';
import { useI18n, type MessageKey } from '../../i18n';
import { columnTypeKey } from './tableUtils';

/** Ten types in three named groups, most used first (choice-overload budget: ≤ 4 per group). */
const GROUPS: { label: MessageKey; types: ColumnType[] }[] = [
  { label: 'table.typeGroup.common', types: ['text', 'select', 'number', 'date'] },
  { label: 'table.typeGroup.address', types: ['email', 'url'] },
  { label: 'table.typeGroup.other', types: ['money', 'decimal', 'boolean', 'category'] },
];

/** <option>s for a column-type <select>, grouped with <optgroup>. */
export function ColumnTypeOptions() {
  const { t } = useI18n();
  return (
    <>
      {GROUPS.map((group) => (
        <optgroup key={group.label} label={t(group.label)}>
          {group.types.map((ct) => (
            <option key={ct} value={ct}>
              {t(columnTypeKey[ct])}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
