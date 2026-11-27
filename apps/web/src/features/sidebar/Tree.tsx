import {
  BookOpen,
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  FolderInput,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { displayNameOf, type TreeNode } from '@panoya/domain';
import { useTrash } from '../../app/actions';
import { navigate } from '../../app/router';
import { useRunCommand, useServices } from '../../app/services';
import { MenuButton, type MenuItem } from '../../components/Menu';
import { useI18n } from '../../i18n';
import type { MoveRequest } from './MoveDialog';

const EXPANDED_KEY = 'panoya:expanded';

function loadExpanded(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

interface TreeProps {
  nodes: TreeNode[];
  activePageId: string | null;
  onMove: (request: MoveRequest) => void;
  /** Ids that must be expanded (ancestors of the open page, newly created items). */
  reveal: string[];
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  onNavigate: () => void;
}

/**
 * WAI-ARIA tree: ↑/↓ move, →/← expand/collapse or go to child/parent, Enter opens, F2 renames.
 * Expansion is per-device UI state (localStorage), never part of the shared data.
 */
export function Tree({
  nodes,
  activePageId,
  onMove,
  reveal,
  renamingId,
  setRenamingId,
  onNavigate,
}: TreeProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const treeRef = useRef<HTMLUListElement>(null);

  // Expand the ancestors of the open page when it changes (adjust state during render).
  const [revealed, setRevealed] = useState<string[]>([]);
  if (reveal !== revealed) {
    setRevealed(reveal);
    if (!reveal.every((id) => expanded.has(id))) setExpanded(new Set([...expanded, ...reveal]));
  }

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      // UI preference only.
    }
  }, [expanded]);

  const toggle = (id: string, open?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT') return;
    const items = [
      ...(treeRef.current?.querySelectorAll<HTMLElement>(
        '[role="treeitem"] > .tree-row > .tree-label',
      ) ?? []),
    ];
    const i = items.indexOf(target);
    if (i < 0) return;
    const item = target.closest<HTMLElement>('[role="treeitem"]');
    const id = item?.dataset.id ?? '';
    const hasChildren = item?.getAttribute('aria-expanded') !== null;
    const isOpen = item?.getAttribute('aria-expanded') === 'true';
    if (e.key === 'ArrowDown') items[i + 1]?.focus();
    else if (e.key === 'ArrowUp') items[i - 1]?.focus();
    else if (e.key === 'Home') items[0]?.focus();
    else if (e.key === 'End') items.at(-1)?.focus();
    else if (e.key === 'ArrowRight') {
      if (hasChildren && !isOpen) toggle(id, true);
      else if (isOpen) items[i + 1]?.focus();
    } else if (e.key === 'ArrowLeft') {
      if (isOpen) toggle(id, false);
      else
        item?.parentElement
          ?.closest<HTMLElement>('[role="treeitem"]')
          ?.querySelector<HTMLElement>('.tree-label')
          ?.focus();
    } else if (e.key === 'F2') setRenamingId(id);
    else return;
    e.preventDefault();
  };

  return (
    <ul ref={treeRef} role="tree" aria-label={t('nav.tree')} className="tree" onKeyDown={onKeyDown}>
      {nodes.map((node, i) => (
        <TreeItem
          key={node.entity.id}
          node={node}
          depth={0}
          first={i === 0}
          expanded={expanded}
          toggle={toggle}
          activePageId={activePageId}
          onMove={onMove}
          renamingId={renamingId}
          setRenamingId={setRenamingId}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  );
}

interface ItemProps {
  node: TreeNode;
  depth: number;
  first: boolean;
  expanded: Set<string>;
  toggle: (id: string, open?: boolean) => void;
  activePageId: string | null;
  onMove: (request: MoveRequest) => void;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  onNavigate: () => void;
}

function TreeItem({
  node,
  depth,
  first,
  expanded,
  toggle,
  activePageId,
  onMove,
  renamingId,
  setRenamingId,
  onNavigate,
}: ItemProps) {
  const { t } = useI18n();
  const { workspace } = useServices();
  const run = useRunCommand();
  const trash = useTrash();
  const id = node.entity.id;
  const name = displayNameOf(node.entity) || t('tree.untitled');
  const isContainer = node.kind !== 'page';
  const isOpen = isContainer && expanded.has(id);
  const isActive = node.kind === 'page' && id === activePageId;
  const renaming = renamingId === id;

  const createChild = async (kind: 'folder' | 'notebook' | 'page') => {
    toggle(id, true);
    if (kind === 'page') {
      const r = await run({
        type: 'createPage',
        workspaceId: workspace.id,
        notebookId: id,
        title: '',
      });
      if (r?.mutation.primary) {
        navigate({ name: 'page', workspaceId: workspace.id, pageId: r.mutation.primary.id });
        onNavigate();
      }
      return;
    }
    const r =
      kind === 'folder'
        ? await run({
            type: 'createFolder',
            workspaceId: workspace.id,
            parentFolderId: id,
            name: t('tree.defaultFolder'),
          })
        : await run({
            type: 'createNotebook',
            workspaceId: workspace.id,
            folderId: id,
            title: t('tree.defaultNotebook'),
          });
    if (r?.mutation.primary) setRenamingId(r.mutation.primary.id);
  };

  const items: MenuItem[] = [
    ...(node.kind === 'folder'
      ? [
          {
            id: 'nf',
            label: t('nav.newFolder'),
            icon: <FolderPlus size={16} />,
            onSelect: () => void createChild('folder'),
          },
          {
            id: 'nn',
            label: t('nav.newNotebook'),
            icon: <BookOpen size={16} />,
            onSelect: () => void createChild('notebook'),
          },
        ]
      : []),
    ...(node.kind === 'notebook'
      ? [
          {
            id: 'np',
            label: t('nav.newPage'),
            icon: <Plus size={16} />,
            onSelect: () => void createChild('page'),
          },
        ]
      : []),
    {
      id: 'rename',
      label: t('tree.rename'),
      icon: <Pencil size={16} />,
      onSelect: () => setRenamingId(id),
    },
    {
      id: 'move',
      label: t('tree.move'),
      icon: <FolderInput size={16} />,
      onSelect: () => onMove({ kind: node.kind, id, name }),
    },
    {
      id: 'trash',
      label: t('tree.trash'),
      icon: <Trash2 size={16} />,
      destructive: true,
      onSelect: () => void trash(node.kind, id, name),
    },
  ];

  const Icon = node.kind === 'folder' ? FolderIcon : node.kind === 'notebook' ? BookOpen : FileText;

  return (
    <li
      role="treeitem"
      data-id={id}
      aria-expanded={isContainer ? isOpen : undefined}
      aria-selected={isActive || undefined}
      aria-level={depth + 1}
    >
      <div
        className={`tree-row${isActive ? ' is-active' : ''}`}
        style={{ paddingInlineStart: `${depth * 14 + 4}px` }}
      >
        {isContainer ? (
          <button
            type="button"
            className="tree-toggle"
            tabIndex={-1}
            aria-label={isOpen ? t('nav.collapse') : t('nav.expand')}
            onClick={() => toggle(id)}
          >
            <ChevronRight size={14} aria-hidden="true" className={isOpen ? 'rot-90' : undefined} />
          </button>
        ) : (
          <span className="tree-toggle" aria-hidden="true" />
        )}
        {renaming ? (
          <RenameInput
            initial={displayNameOf(node.entity)}
            onDone={async (value) => {
              setRenamingId(null);
              if (value !== null && value !== displayNameOf(node.entity)) {
                await run({
                  type: 'rename',
                  workspaceId: workspace.id,
                  kind: node.kind,
                  id,
                  name: value,
                });
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="tree-label"
            tabIndex={isActive || (first && depth === 0 && !activePageId) ? 0 : -1}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => {
              if (node.kind === 'page') {
                navigate({ name: 'page', workspaceId: workspace.id, pageId: id });
                onNavigate();
              } else toggle(id);
            }}
            onDoubleClick={() => setRenamingId(id)}
          >
            <Icon size={16} aria-hidden="true" className="tree-icon" />
            <span className="tree-name">{name}</span>
          </button>
        )}
        <MenuButton
          label={t('nav.itemMenu', { name })}
          items={items}
          className="icon-btn tree-menu"
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </MenuButton>
      </div>
      {isOpen && node.children.length > 0 && (
        <ul role="group">
          {node.children.map((child) => (
            <TreeItem
              key={child.entity.id}
              node={child}
              depth={depth + 1}
              first={false}
              expanded={expanded}
              toggle={toggle}
              activePageId={activePageId}
              onMove={onMove}
              renamingId={renamingId}
              setRenamingId={setRenamingId}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (result: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(result);
  };
  return (
    <input
      className="input tree-rename"
      autoFocus
      value={value}
      maxLength={200}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') finish(value.trim() || null);
        else if (e.key === 'Escape') finish(null);
      }}
    />
  );
}
