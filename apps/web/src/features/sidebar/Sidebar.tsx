import {
  BookOpen,
  Check,
  ChevronDown,
  Download,
  FolderPlus,
  Home,
  Inbox,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { useRunCommand, useServices, useStoreQuery } from '../../app/services';
import { switchWorkspace } from '../../app/workspaceSelection';
import { ExportBackupDialog, RestoreBackupDialog } from '../backup/BackupDialogs';
import { useWorkspaceIndex } from '../../app/workspaceData';
import { LogoMark } from '../../components/Logo';
import { MenuButton } from '../../components/Menu';
import { useI18n } from '../../i18n';
import { MoveDialog, type MoveRequest } from './MoveDialog';
import { Tree } from './Tree';

interface Props {
  activePageId: string | null;
  trashActive: boolean;
  homeActive: boolean;
  onSearch: () => void;
  onCapture: () => void;
  onOpenInbox: () => void;
  onLoadDemo: () => void;
  onNavigate: () => void;
  /** Phone drawer: close button. */
  onClose: () => void;
}

export function Sidebar({
  activePageId,
  trashActive,
  homeActive,
  onSearch,
  onCapture,
  onOpenInbox,
  onLoadDemo,
  onNavigate,
  onClose,
}: Props) {
  const { t } = useI18n();
  const { workspace } = useServices();
  const index = useWorkspaceIndex();
  const run = useRunCommand();
  const [moveRequest, setMoveRequest] = useState<MoveRequest | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [backupDialog, setBackupDialog] = useState<'export' | 'restore' | null>(null);
  const { store, saveTracker } = useServices();
  const { data: workspaces } = useStoreQuery(
    () => store.listWorkspaces(),
    () => false,
    [],
  );

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
        <MenuButton
          label={t('workspace.menu')}
          className="brand-btn"
          align="start"
          items={[
            ...(workspaces ?? []).map((w) => ({
              id: `ws-${w.id}`,
              label: w.name,
              icon:
                w.id === workspace.id ? <Check size={16} /> : <span className="menu-icon-spacer" />,
              onSelect: () => {
                if (w.id !== workspace.id)
                  void saveTracker.flushAll().then(() => switchWorkspace(w.id));
              },
            })),
            {
              id: 'export',
              label: t('backup.exportTitle'),
              icon: <Download size={16} />,
              onSelect: () => setBackupDialog('export'),
            },
            {
              id: 'restore',
              label: t('backup.restoreTitle'),
              icon: <Upload size={16} />,
              onSelect: () => setBackupDialog('restore'),
            },
          ]}
        >
          <LogoMark size={30} />
          <span className="brand-text">
            <span className="brand">{t('app.name')}</span>
            <span className="brand-ws">{workspace.name}</span>
          </span>
          <ChevronDown size={14} aria-hidden="true" className="brand-caret" />
        </MenuButton>
        <button
          type="button"
          className="icon-btn drawer-close"
          aria-label={t('nav.closeMenu')}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <button type="button" className="btn btn-primary sidebar-capture" onClick={onCapture}>
        <Plus size={18} aria-hidden="true" />
        <span>{t('capture.open')}</span>
      </button>

      <ul className="nav-list">
        <li>
          <button
            type="button"
            className={`nav-item${homeActive ? ' is-active' : ''}`}
            aria-current={homeActive ? 'page' : undefined}
            onClick={() => {
              navigate({ name: 'home' });
              onNavigate();
            }}
          >
            <Home size={16} aria-hidden="true" />
            <span>{t('nav.home')}</span>
          </button>
        </li>
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
        <div className="sidebar-section-head">
          <h2 className="sidebar-section-title">{t('nav.pages')}</h2>
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
      <ExportBackupDialog open={backupDialog === 'export'} onClose={() => setBackupDialog(null)} />
      <RestoreBackupDialog
        open={backupDialog === 'restore'}
        onClose={() => setBackupDialog(null)}
      />
    </nav>
  );
}
