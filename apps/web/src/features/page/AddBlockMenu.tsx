import { Plus } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { blockUis } from '../blocks/catalog';
import { foldText } from '../../app/text';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: string) => void;
  /** Button rendered as the primary "Blok ekle" action. */
  showButton?: boolean;
}

/**
 * Block-type picker: 8 types grouped into 2 categories with search (Hick/choice-overload budget),
 * default "Metin" first and pre-selected. Keyboard: type to filter, ↑/↓, Enter, Esc.
 */
export function AddBlockMenu({ open, onOpenChange, onPick, showButton = true }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const results = useMemo(() => {
    const q = foldText(query.trim());
    return blockUis.filter((b) => !q || foldText(`${t(b.label)} ${t(b.synonyms)}`).includes(q));
  }, [query, t]);

  const close = () => {
    onOpenChange(false);
    setQuery('');
    setActive(0);
  };
  const pick = (type: string) => {
    close();
    onPick(type);
  };

  const groups = (['text', 'productivity'] as const)
    .map((category) => ({ category, items: results.filter((r) => r.category === category) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="add-block">
      {showButton && (
        <button
          ref={buttonRef}
          type="button"
          className="btn btn-primary"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
        >
          <Plus size={18} aria-hidden="true" />
          <span>{t('page.addBlock')}</span>
        </button>
      )}
      {open && (
        <>
          <div className="menu-scrim" aria-hidden="true" onClick={close} />
          <div className="menu menu-start block-picker">
            <input
              className="input"
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={
                results[active] ? `${listId}-${results[active].type}` : undefined
              }
              aria-label={t('blockMenu.filter')}
              placeholder={t('blockMenu.filter')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
                else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
                else if (e.key === 'Enter' && results[active]) pick(results[active].type);
                else if (e.key === 'Escape') {
                  close();
                  buttonRef.current?.focus();
                } else return;
                e.preventDefault();
              }}
            />
            <div id={listId} role="listbox" aria-label={t('page.addBlock')}>
              {groups.length === 0 && <p className="menu-empty">{t('blockMenu.none')}</p>}
              {groups.map((group) => (
                <div
                  key={group.category}
                  role="group"
                  aria-label={t(`blockCategory.${group.category}`)}
                >
                  <p className="menu-group-label" aria-hidden="true">
                    {t(`blockCategory.${group.category}`)}
                  </p>
                  {group.items.map((item) => {
                    const index = results.indexOf(item);
                    const Icon = item.icon;
                    return (
                      <div
                        key={item.type}
                        id={`${listId}-${item.type}`}
                        role="option"
                        aria-selected={index === active}
                        className={`menu-item${index === active ? ' is-active' : ''}`}
                        onPointerEnter={() => setActive(index)}
                        onClick={() => pick(item.type)}
                      >
                        <span className="menu-icon" aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        <span>{t(item.label)}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
