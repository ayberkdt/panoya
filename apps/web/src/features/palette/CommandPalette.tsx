import {
  BookOpen,
  CheckSquare,
  ClipboardCopy,
  Code2,
  FileText,
  Folder,
  Globe,
  Heading2,
  Inbox,
  Link2,
  Mail,
  Plus,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react';
import {
  useDeferredValue,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { TreeNode } from '@panoya/domain';
import type { QueryError, SearchHit } from '@panoya/search';
import { revealBlock } from '../../app/focus';
import { navigate } from '../../app/router';
import { useServices } from '../../app/services';
import { foldText } from '../../app/text';
import { useWorkspaceIndex } from '../../app/workspaceData';
import { BusyNote } from '../../components/BusyNote';
import { Dialog } from '../../components/Dialog';
import { useI18n, type MessageKey } from '../../i18n';

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

interface Entry {
  key: string;
  run: () => void;
}

const typeIcon: Record<string, ReactNode> = {
  folder: <Folder size={16} />,
  notebook: <BookOpen size={16} />,
  page: <FileText size={16} />,
  richText: <Type size={16} />,
  heading: <Heading2 size={16} />,
  link: <Link2 size={16} />,
  mailDraft: <Mail size={16} />,
  quickCopy: <ClipboardCopy size={16} />,
  checklist: <CheckSquare size={16} />,
  code: <Code2 size={16} />,
};

const fieldKey: Record<SearchHit['field'], MessageKey> = {
  title: 'search.field.title',
  tag: 'search.field.tag',
  url: 'search.field.url',
  subject: 'search.field.subject',
  content: 'search.field.content',
};

/** Renders text with highlighted ranges as React nodes (never as HTML). */
function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  ranges.forEach(([from, to], i) => {
    if (from < cursor) return;
    if (from > cursor) parts.push(text.slice(cursor, from));
    parts.push(<mark key={i}>{text.slice(from, to)}</mark>);
    cursor = to;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/**
 * Ctrl/Cmd+K: local full-text search (spec 09) and commands, shown as separate groups.
 * ↑/↓ select, Enter opens, Esc closes. Queries never leave the device.
 */
export function CommandPalette({ open, onClose, actions }: Props) {
  const { t } = useI18n();
  const { workspace, search } = useServices();
  const index = useWorkspaceIndex();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const deferredQuery = useDeferredValue(query);
  const status = useSyncExternalStore(search.subscribe, () => search.status);
  const revision = useSyncExternalStore(search.subscribe, () => search.revision);

  const commands = [
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

  const { hits, errors } = useMemo(() => {
    void revision; // re-run when the index changes
    if (!deferredQuery.trim() || status !== 'ready')
      return { hits: [] as SearchHit[], errors: [] as QueryError[] };
    const result = search.search(deferredQuery, 30);
    return { hits: result.hits, errors: result.query.errors };
  }, [deferredQuery, search, status, revision]);

  const recent = useMemo(() => {
    if (query.trim()) return [];
    return [...index.pages.values()]
      .filter((p) => p.trashed === 0 && index.pathTo(p.id).length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6);
  }, [index, query]);

  const q = foldText(query.trim());
  const matchedCommands = commands.filter((c) => !q || foldText(c.label).includes(q));

  const firstPageIn = (containerId: string): string | null => {
    const walk = (nodes: TreeNode[], inside: boolean): string | null => {
      for (const node of nodes) {
        const within = inside || node.entity.id === containerId;
        if (within && node.kind === 'page') return node.entity.id;
        const found = walk(node.children, within);
        if (found) return found;
      }
      return null;
    };
    return walk(index.tree, false);
  };

  const openHit = (hit: SearchHit) => {
    const doc = hit.doc;
    const pageId = doc.pageId ?? firstPageIn(doc.id);
    if (!pageId) return;
    navigate({ name: 'page', workspaceId: workspace.id, pageId });
    if (doc.kind === 'block') revealBlock(doc.id);
  };

  const entries: Entry[] = [
    ...recent.map((p) => ({
      key: `r-${p.id}`,
      run: () => navigate({ name: 'page', workspaceId: workspace.id, pageId: p.id }),
    })),
    ...hits.map((h) => ({ key: `h-${h.doc.id}`, run: () => openHit(h) })),
    ...matchedCommands.map((c) => ({ key: `c-${c.id}`, run: c.run })),
  ];

  const execute = (i: number) => {
    const entry = entries[i];
    if (!entry) return;
    onClose();
    setQuery('');
    entry.run();
  };

  const errorText = (e: QueryError) =>
    e.code === 'badDate'
      ? t('search.error.badDate', { filter: e.filter, value: e.value })
      : e.code === 'unknownFilter'
        ? t('search.error.unknownFilter', { filter: e.filter })
        : t('search.error.emptyFilter', { filter: e.filter });

  const option = (
    i: number,
    key: string,
    icon: ReactNode,
    main: ReactNode,
    aside?: ReactNode,
    sub?: ReactNode,
  ) => (
    <div
      key={key}
      id={`${listId}-${i}`}
      role="option"
      aria-selected={active === i}
      className={`menu-item search-item${active === i ? ' is-active' : ''}`}
      onPointerEnter={() => setActive(i)}
      onClick={() => execute(i)}
    >
      <span className="menu-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="search-main">
        <span className="search-title">{main}</span>
        {sub && <span className="search-snippet">{sub}</span>}
      </span>
      {aside && <span className="target-path">{aside}</span>}
    </div>
  );

  let i = -1;
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
        aria-activedescendant={entries[active] ? `${listId}-${active}` : undefined}
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
      {status === 'building' ? (
        <BusyNote active label={t('search.building')} />
      ) : (
        <p className="muted small search-hint">
          {status === 'error' ? (
            t('search.failed')
          ) : (
            <>
              <span>{t('search.hint')}</span>
              {t('search.hintExamples')
                .split(' ')
                .map((example) => (
                  <code key={example} className="hint-chip">
                    {example}
                  </code>
                ))}
            </>
          )}
        </p>
      )}
      {errors.length > 0 && (
        <div className="hint-warn" role="status">
          {errors.map((e, k) => (
            <p key={k}>{errorText(e)}</p>
          ))}
        </div>
      )}
      <div id={listId} role="listbox" aria-label={t('palette.title')} className="palette-list">
        {recent.length > 0 && (
          <div role="group" aria-label={t('palette.recent')}>
            <p className="menu-group-label" aria-hidden="true">
              {t('palette.recent')}
            </p>
            {recent.map((p) => {
              i++;
              return option(
                i,
                `r-${p.id}`,
                typeIcon.page,
                p.title || t('tree.untitled'),
                index
                  .pathTo(p.id)
                  .slice(0, -1)
                  .map((x) => x.name)
                  .join(' / '),
              );
            })}
          </div>
        )}
        {query.trim() !== '' &&
          status === 'ready' &&
          hits.length === 0 &&
          matchedCommands.length === 0 && <p className="muted">{t('palette.none')}</p>}
        {hits.length > 0 && (
          <div role="group" aria-label={t('palette.results')}>
            <p className="menu-group-label" aria-hidden="true">
              {t('palette.results')}
            </p>
            {hits.map((hit) => {
              i++;
              const doc = hit.doc;
              const title =
                doc.title ||
                (doc.kind === 'page'
                  ? t('tree.untitled')
                  : t(`blockType.${doc.type}` as MessageKey));
              const titleRanges =
                hit.field === 'title' && hit.snippet ? hit.snippet.highlights : [];
              return option(
                i,
                `h-${doc.id}`,
                typeIcon[doc.type] ?? typeIcon.page,
                hit.field === 'title' ? <Highlighted text={title} ranges={titleRanges} /> : title,
                <>
                  {doc.path.join(' / ')} · {t(fieldKey[hit.field])}
                </>,
                hit.field !== 'title' && hit.snippet ? (
                  <Highlighted text={hit.snippet.text} ranges={hit.snippet.highlights} />
                ) : undefined,
              );
            })}
          </div>
        )}
        {matchedCommands.length > 0 && (
          <div role="group" aria-label={t('palette.actions')}>
            <p className="menu-group-label" aria-hidden="true">
              {t('palette.actions')}
            </p>
            {matchedCommands.map((c) => {
              i++;
              return option(i, `c-${c.id}`, c.icon, c.label);
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
