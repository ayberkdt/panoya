import { BookOpen, FolderPlus, Inbox, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { useRunCommand, useServices } from '../../app/services';
import { useWorkspaceIndex } from '../../app/workspaceData';
import { MenuButton } from '../../components/Menu';
import { useI18n } from '../../i18n';
import { MoveDialog, type MoveRequest } from './MoveDialog';
import { Tree } from './Tree';

interface Props {
  activePageId: string | null;
  trashActive: boolean;
  onSearch: () => void;
  onCapture: () => void;
  onOpenInbox: () => void;
  onLoadDemo: () => void;
  onNavigate: () => void;
}

export function Sidebar({
  activePageId,
  trashActive,
  onSearch,
  onCapture,
  onOpenInbox,
  onLoadDemo,
  onNavigate,
}: Props) {
  const { t } = useI18n();
  const { workspace } = useServices();
  const index = useWorkspaceIndex();
  const run = useRunCommand();
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const reveal = useMemo(() => {
    const ids = activePageId
      ? index
          .pathTo(activePageId)
          .filter((i) => i.kind !== 'page')
          .map((i) => i.id)
      : [];
    return ids;
  }, [activePageId, index]);

  const createRoot = async (kind: 'folder' | 'notebook') => {
    const r =
      kind === 'folder'
        ? await run({
            type: 'createFolder',
            workspaceId: workspace.id,
            parentFolderId: null,
            name: t('tree.defaultFolder'),
          })
        : await run({
            type: 'createNotebook',
            workspaceId: workspace.id,
            folderId: null,
            title: t('tree.defaultNotebook'),
          });
    if (r?.mutation.primary) setRenamingId(r.mutation.primary.id);
  };

  return (
    <nav className="sidebar" aria-label={t('nav.workspace')}>
      <div className="sidebar-head">
        <span className="brand">{t('app.name')}</span>
        <MenuButton
          label={t('nav.new')}
          items={[
            {
              id: 'folder',
              label: t('nav.newFolder'),
              icon: <FolderPlus size={16} />,
              onSelect: () => void createRoot('folder'),
            },
            {
              id: 'notebook',
              label: t('nav.newNotebook'),
              icon: <BookOpen size={16} />,
              onSelect: () => void createRoot('notebook'),
            },
          ]}
        >
          <Plus size={18} aria-hidden="true" />
        </MenuButton>
      </div>

      <button type="button" className="btn btn-primary sidebar-capture" onClick={onCapture}>
        <Plus size={18} aria-hidden="true" />
        <span>{t('capture.open')}</span>
      </button>

      <ul className="nav-list">
        <li>
          <button type="button" className="nav-item" onClick={onSearch}>
            <Search size={16} aria-hidden="true" />
            <span>{t('nav.search')}</span>
            <kbd className="kbd">{t('palette.hint')}</kbd>
          </button>
        </li>
        <li>
          <button type="button" className="nav-item" onClick={onOpenInbox}>
            <Inbox size={16} aria-hidden="true" />
            <span>{t('nav.inbox')}</span>
          </button>
        </li>
        <li>
          <button
            type="button"
            className={`nav-item${trashActive ? ' is-active' : ''}`}
            aria-current={trashActive ? 'page' : undefined}
            onClick={() => {
              navigate({ name: 'trash', workspaceId: workspace.id });
              onNavigate();
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            <span>{t('nav.trash')}</span>
          </button>
        </li>
      </ul>

      <div className="sidebar-tree">
        {!index.loading && index.tree.length === 0 ? (
          <div className="empty-tree">
            <p className="muted">{t('nav.emptyTree')}</p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void createRoot('folder')}
            >
              <FolderPlus size={16} aria-hidden="true" />
              <span>{t('nav.createFirstFolder')}</span>
            </button>
            <button type="button" className="btn btn-ghost" onClick={onLoadDemo}>
              <Sparkles size={16} aria-hidden="true" />
              <span>{t('nav.loadDemo')}</span>
            </button>
          </div>
        ) : (
          <Tree
            nodes={index.tree}
            activePageId={activePageId}
            onMove={setMoveRequest}
            reveal={reveal}
            renamingId={renamingId}
            setRenamingId={setRenamingId}
            onNavigate={onNavigate}
          />
        )}
      </div>
      <MoveDialog request={moveRequest} onClose={() => setMoveRequest(null)} />
    </nav>
  );
}
