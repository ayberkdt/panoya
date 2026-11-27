import { Plus } from 'lucide-react';
import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useI18n, type MessageKey } from '../../i18n';
import { DEFAULT_PLACEMENT, placeMenu, type Placement } from '../../components/menuPlacement';
import { pickerItems } from '../blocks/catalog';
import { foldText } from '../../app/text';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (type: string) => void;
  /** Button rendered as the primary "Blok ekle" action. */
  showButton?: boolean;
}

/** One-line description under each type: "blockType.link" → "blockDesc.link". */
const descKey = (label: MessageKey) => label.replace('blockType.', 'blockDesc.') as MessageKey;

/**
 * Block-type picker: 9 types grouped into 3 categories with search (Hick/choice-overload budget),
 * default "Metin" first and pre-selected. Keyboard: type to filter, ↑/↓, Enter, Esc.
 */
export function AddBlockMenu({ open, onOpenChange, onPick, showButton = true }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT);
  const listId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const results = useMemo(() => {
    const q = foldText(query.trim());
    return pickerItems.filter(
      (b) => !q || foldText(`${t(b.label)} ${t(b.synonyms)} ${t(descKey(b.label))}`).includes(q),
    );
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

  const groups = (['text', 'productivity', 'data'] as const)
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
          onClick={() => {
            if (!open) setPlacement(placeMenu(buttonRef.current, 440));
            onOpenChange(!open);
          }}
        >
          <Plus size={18} aria-hidden="true" />
          <span>{t('page.addBlock')}</span>
        </button>
      )}
      {open && (
        <>
          <div className="menu-scrim" aria-hidden="true" onClick={close} />
          <div
            className={`menu menu-start block-picker${placement.side === 'up' ? ' menu-up' : ''}`}
            style={{ '--menu-max': `${placement.maxHeight}px` } as CSSProperties}
          >
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
            <div id={listId} role="listbox" aria-label={t('page.addBlock')} className="picker-list">
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
                        className={`menu-item picker-item${index === active ? ' is-active' : ''}`}
                        onPointerEnter={() => setActive(index)}
                        onClick={() => pick(item.type)}
                      >
                        <span className={`picker-icon opt-${item.tint}`} aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        <span className="picker-text">
                          <span className="picker-label">{t(item.label)}</span>
                          <span className="picker-desc">{t(descKey(item.label))}</span>
                        </span>
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
