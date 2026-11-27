import { Plus, X } from 'lucide-react';
import { useId, useRef } from 'react';
import type { ChecklistPayload, CodePayload, DividerPayload, HeadingPayload } from '@panoya/blocks';
import { CopyButton } from '../../components/Copy';
import { useI18n } from '../../i18n';
import { AutoTextarea } from './AutoTextarea';
import type { BlockViewProps } from './types';
import { useBlockDraft } from './useBlockDraft';

export function HeadingBlock({
  block,
  payload,
  autoFocus,
  onNewBlock,
}: BlockViewProps<HeadingPayload>) {
  const draft = useBlockDraft(block, payload);
  const { t } = useI18n();
  return (
    <input
      className={`input input-quiet heading-input heading-${draft.value.level}`}
      aria-label={t('heading.placeholder')}
      placeholder={t('heading.placeholder')}
      value={draft.value.text}
      autoFocus={autoFocus}
      onChange={(e) => draft.set({ ...draft.value, text: e.target.value })}
      onBlur={() => void draft.flush()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && onNewBlock) {
          e.preventDefault();
          onNewBlock();
        }
      }}
    />
  );
}

export function DividerBlock(_props: BlockViewProps<DividerPayload>) {
  return <hr className="divider" />;
}

export function CodeBlock({ block, payload, autoFocus }: BlockViewProps<CodePayload>) {
  const draft = useBlockDraft(block, payload);
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="code-block">
      <div className="code-head">
        <input
          className="input input-quiet code-lang"
          aria-label={t('code.language')}
          placeholder={t('code.language')}
          value={draft.value.language}
          onChange={(e) => draft.set({ ...draft.value, language: e.target.value.slice(0, 32) })}
        />
        <CopyButton
          getText={() => draft.value.source}
          label={t('code.copy')}
          variant="icon"
          disabled={draft.value.source === ''}
        />
      </div>
      <label htmlFor={id} className="sr-only">
        {t('code.source')}
      </label>
      <AutoTextarea
        id={id}
        className="input code-source"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={draft.value.source}
        autoFocus={autoFocus}
        onChange={(source) => draft.set({ ...draft.value, source })}
        onBlur={() => void draft.flush()}
      />
    </div>
  );
}

const newItemId = () => crypto.randomUUID().slice(0, 8);

export function ChecklistBlock({ block, payload, autoFocus }: BlockViewProps<ChecklistPayload>) {
  const draft = useBlockDraft(block, payload);
  const { t } = useI18n();
  const listRef = useRef<HTMLUListElement>(null);
  const items = draft.value.items;
  const done = items.filter((i) => i.checked).length;

  const focusItem = (index: number) =>
    requestAnimationFrame(() =>
      listRef.current?.querySelectorAll<HTMLInputElement>('input[type="text"]')[index]?.focus(),
    );

  const addAfter = (index: number) => {
    const next = [...items];
    next.splice(index + 1, 0, { id: newItemId(), text: '', checked: false });
    draft.set({ items: next });
    focusItem(index + 1);
  };

  return (
    <div className="checklist">
      {items.length > 0 && (
        <p className="checklist-progress">
          {t('checklist.progress', { done, total: items.length })}
        </p>
      )}
      <ul ref={listRef}>
        {items.map((item, index) => (
          <li key={item.id} className={item.checked ? 'is-done' : undefined}>
            <input
              type="checkbox"
              className="checkbox"
              checked={item.checked}
              aria-label={item.text || t('checklist.item')}
              onChange={(e) =>
                draft.commit({
                  items: items.map((i) =>
                    i.id === item.id ? { ...i, checked: e.target.checked } : i,
                  ),
                })
              }
            />
            <input
              type="text"
              className="input input-quiet"
              aria-label={t('checklist.item')}
              value={item.text}
              autoFocus={autoFocus && index === 0}
              onChange={(e) =>
                draft.set({
                  items: items.map((i) => (i.id === item.id ? { ...i, text: e.target.value } : i)),
                })
              }
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addAfter(index);
                } else if (e.key === 'Backspace' && item.text === '' && items.length > 1) {
                  e.preventDefault();
                  draft.set({ items: items.filter((i) => i.id !== item.id) });
                  focusItem(Math.max(0, index - 1));
                }
              }}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={t('checklist.remove')}
              onClick={() => draft.commit({ items: items.filter((i) => i.id !== item.id) })}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-ghost btn-small"
        onClick={() => addAfter(items.length - 1)}
      >
        <Plus size={16} aria-hidden="true" />
        <span>{t('checklist.add')}</span>
      </button>
    </div>
  );
}

export function UnknownBlockView({
  text,
  reason,
}: {
  text: string;
  reason: 'unknown' | 'invalid';
}) {
  const { t } = useI18n();
  return (
    <div className="unknown-block">
      <p className="hint-warn">{t(reason === 'unknown' ? 'block.unknown' : 'block.invalid')}</p>
      {text && <pre className="unknown-text">{text}</pre>}
      {text && <CopyButton getText={() => text} label={t('quickCopy.copy')} />}
    </div>
  );
}
