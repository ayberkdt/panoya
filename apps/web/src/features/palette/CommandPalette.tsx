import { FileText, Globe, Inbox, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { useServices } from '../../app/services';
import { foldText } from '../../app/text';
import { useWorkspaceIndex } from '../../app/workspaceData';
import { Dialog } from '../../components/Dialog';
import { useI18n } from '../../i18n';

export interface PaletteAction {
  id: string;
  label: string;
  icon: ReactNode;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  actions: {
    capture: () => void;
    inbox: () => void;
    demo: () => void;
    toggleLanguage: () => void;
    languageLabel: string;
  };
}

/**
 * Ctrl/Cmd+K: title search over pages (full-text search arrives with the G3 index) and commands,
 * shown as two separate groups. ↑/↓ select, Enter runs, Esc closes.
 */
export function CommandPalette({ open, onClose, actions }: Props) {
  const { t } = useI18n();
  const { workspace } = useServices();
  const index = useWorkspaceIndex();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const commands: PaletteAction[] = [
    { id: 'capture', label: t('capture.open'), icon: <Plus size={16} />, run: actions.capture },
    { id: 'inbox', label: t('nav.inbox'), icon: <Inbox size={16} />, run: actions.inbox },
    {
      id: 'trash',
      label: t('nav.trash'),
      icon: <Trash2 size={16} />,
      run: () => navigate({ name: 'trash', workspaceId: workspace.id }),
    },
    {
      id: 'lang',
      label: actions.languageLabel,
      icon: <Globe size={16} />,
      run: actions.toggleLanguage,
    },
    { id: 'demo', label: t('nav.loadDemo'), icon: <Sparkles size={16} />, run: actions.demo },
  ];

  const q = foldText(query.trim());
  const pages = useMemo(() => {
    const list = [...index.pages.values()]
      .filter((p) => p.trashed === 0)
      .map((p) => ({ page: p, path: index.pathTo(p.id) }))
      .filter(({ path }) => path.length > 0);
    if (!q)
      return list.sort((a, b) => b.page.updatedAt.localeCompare(a.page.updatedAt)).slice(0, 8);
    return list
      .map((item) => {
        const title = foldText(item.page.title);
        // exact > prefix > contains (title), then path; recency breaks ties.
        const score =
          title === q
            ? 0
            : title.startsWith(q)
              ? 1
              : title.includes(q)
                ? 2
                : foldText(item.path.map((p) => p.name).join(' ')).includes(q)
                  ? 3
                  : 9;
        return { ...item, score };
      })
      .filter((item) => item.score < 9)
      .sort((a, b) => a.score - b.score || b.page.updatedAt.localeCompare(a.page.updatedAt))
      .slice(0, 20);
  }, [index, q]);
  const matchedCommands = commands.filter((c) => !q || foldText(c.label).includes(q));

  const entries = [
    ...pages.map((p) => ({
      id: p.page.id,
      run: () => navigate({ name: 'page', workspaceId: workspace.id, pageId: p.page.id }),
    })),
    ...matchedCommands.map((c) => ({ id: c.id, run: c.run })),
  ];

  const execute = (i: number) => {
    const entry = entries[i];
    if (!entry) return;
    onClose();
    setQuery('');
    entry.run();
  };

  return (
    <Dialog
      open={open}
      title={t('palette.title')}
      onClose={onClose}
      initialFocus={inputRef}
      sheet={false}
    >
      <input
        ref={inputRef}
        className="input"
        role="combobox"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={entries[active] ? `${listId}-${entries[active].id}` : undefined}
        aria-label={t('palette.placeholder')}
        placeholder={t('palette.placeholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, entries.length - 1));
          else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          else if (e.key === 'Enter') execute(active);
          else return;
          e.preventDefault();
        }}
      />
      <div id={listId} role="listbox" aria-label={t('palette.title')} className="palette-list">
        {entries.length === 0 && <p className="muted">{t('palette.none')}</p>}
        {pages.length > 0 && (
          <div role="group" aria-label={t('palette.pages')}>
            <p className="menu-group-label" aria-hidden="true">
              {t('palette.pages')}
            </p>
            {pages.map((p, i) => (
              <div
                key={p.page.id}
                id={`${listId}-${p.page.id}`}
                role="option"
                aria-selected={active === i}
                className={`menu-item${active === i ? ' is-active' : ''}`}
                onPointerEnter={() => setActive(i)}
                onClick={() => execute(i)}
              >
                <span className="menu-icon" aria-hidden="true">
                  <FileText size={16} />
                </span>
                <span>{p.page.title || t('tree.untitled')}</span>
                <span className="target-path">
                  {p.path
                    .slice(0, -1)
                    .map((x) => x.name)
                    .join(' / ')}
                </span>
              </div>
            ))}
          </div>
        )}
        {matchedCommands.length > 0 && (
          <div role="group" aria-label={t('palette.actions')}>
            <p className="menu-group-label" aria-hidden="true">
              {t('palette.actions')}
            </p>
            {matchedCommands.map((c, j) => {
              const i = pages.length + j;
              return (
                <div
                  key={c.id}
                  id={`${listId}-${c.id}`}
                  role="option"
                  aria-selected={active === i}
                  className={`menu-item${active === i ? ' is-active' : ''}`}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => execute(i)}
                >
                  <span className="menu-icon" aria-hidden="true">
                    {c.icon}
                  </span>
                  <span>{c.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
