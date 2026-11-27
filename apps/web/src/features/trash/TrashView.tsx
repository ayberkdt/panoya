import { BookOpen, FileText, Folder as FolderIcon, Square } from 'lucide-react';
import { useState } from 'react';
import { displayNameOf, isDomainError } from '@panoya/domain';
import type { TrashEntry } from '@panoya/storage';
import { useServices, useStoreQuery } from '../../app/services';
import { ConfirmDialog } from '../../components/Dialog';
import { useToast } from '../../components/Toasts';
import { useI18n } from '../../i18n';
import { MoveDialog, type MoveRequest } from '../sidebar/MoveDialog';

export function TrashView() {
  const { t, errorText, formatDateTime } = useI18n();
  const { store, registry, workspace } = useServices();
  const toast = useToast();
  const [purge, setPurge] = useState<TrashEntry | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<MoveRequest | null>(null);
  const { data } = useStoreQuery(
    () => store.listTrash(workspace.id),
    (c) => c.workspaceId === workspace.id,
    [workspace.id],
  );

  const nameOf = (entry: TrashEntry) =>
    entry.root.kind === 'block'
      ? registry.plainText(entry.root).slice(0, 80) || t('blockType.richText')
      : displayNameOf(entry.root) || t('tree.untitled');

  const restore = async (entry: TrashEntry) => {
    try {
      await store.execute({ type: 'restore', workspaceId: workspace.id, batchId: entry.batchId });
    } catch (error) {
      if (isDomainError(error) && error.messageKey === 'error.restore.parentMissing') {
        setRestoreTarget({
          kind: entry.root.kind,
          id: entry.root.id,
          name: nameOf(entry),
          restoreBatchId: entry.batchId,
        });
      } else toast.show({ message: errorText(error), tone: 'error' });
    }
  };

  const Icon = ({ kind }: { kind: TrashEntry['root']['kind'] }) =>
    kind === 'folder' ? (
      <FolderIcon size={16} />
    ) : kind === 'notebook' ? (
      <BookOpen size={16} />
    ) : kind === 'page' ? (
      <FileText size={16} />
    ) : (
      <Square size={16} />
    );

  return (
    <main className="page" id="main" aria-labelledby="trash-title">
      <h1 id="trash-title" className="page-heading">
        {t('trash.title')}
      </h1>
      <p className="muted">{t('trash.note')}</p>
      {data && data.length === 0 && <p className="page-empty">{t('trash.empty')}</p>}
      <ul className="trash-list">
        {(data ?? []).map((entry) => (
          <li key={entry.batchId} className="trash-row">
            <span className="menu-icon" aria-hidden="true">
              <Icon kind={entry.root.kind} />
            </span>
            <div className="trash-info">
              <span className="trash-name">{nameOf(entry)}</span>
              <span className="muted small">
                {t('trash.deletedAt', { date: formatDateTime(entry.deletedAt) })} ·{' '}
                {t('trash.items', { count: entry.count })}
              </span>
            </div>
            <button type="button" className="btn btn-ghost" onClick={() => void restore(entry)}>
              {t('trash.restore')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small btn-danger-text"
              onClick={() => setPurge(entry)}
            >
              {t('trash.purge')}
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={purge !== null}
        title={t('trash.purge')}
        message={purge ? t('trash.purgeConfirm', { name: nameOf(purge), count: purge.count }) : ''}
        confirmLabel={t('trash.purge')}
        destructive
        onClose={() => setPurge(null)}
        onConfirm={() => {
          if (!purge) return;
          store
            .execute({ type: 'purge', workspaceId: workspace.id, batchId: purge.batchId })
            .catch((e: unknown) => toast.show({ message: errorText(e), tone: 'error' }));
        }}
      />
      <MoveDialog request={restoreTarget} onClose={() => setRestoreTarget(null)} />
    </main>
  );
}
