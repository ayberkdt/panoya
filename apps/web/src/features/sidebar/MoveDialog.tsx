import { Folder as FolderIcon, BookOpen, FileText, Home } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { EntityKind } from '@panoya/domain';
import { useServices, useRunCommand } from '../../app/services';
import { foldText } from '../../app/text';
import { useWorkspaceIndex } from '../../app/workspaceData';
import { Dialog } from '../../components/Dialog';
import { useI18n } from '../../i18n';

export interface MoveRequest {
  kind: EntityKind;
  id: string;
  name: string;
  /** Restore-from-trash mode: picks a target for `restore` instead of `move`. */
  restoreBatchId?: string;
}

interface Target {
  id: string | null;
  label: string;
  path: string;
  kind: 'root' | 'folder' | 'notebook' | 'page';
}

/** Destination picker for move / restore. Only valid targets are offered (no cycles). */
export function MoveDialog({
  request,
  onClose,
  onDone,
}: {
  request: MoveRequest | null;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { t } = useI18n();
  const { workspace } = useServices();
  const run = useRunCommand();
  const index = useWorkspaceIndex();
  const [query, setQuery] = useState('');

  const targets = useMemo<Target[]>(() => {
    if (!request) return [];
    const folderPath = (id: string | null): string => {
      const names: string[] = [];
      let cursor = id;
      while (cursor) {
        const f = index.folders.get(cursor);
        if (!f) break;
        names.unshift(f.name);
        cursor = f.parentFolderId;
      }
      return names.join(' / ');
    };
    const visibleFolder = (id: string): boolean => {
      let cursor: string | null = id;
      while (cursor) {
        const f = index.folders.get(cursor);
        if (!f || f.trashed === 1) return false;
        cursor = f.parentFolderId;
      }
      return true;
    };
    const isInside = (folderId: string, ancestorId: string) => {
      let cursor: string | null = folderId;
      while (cursor) {
        if (cursor === ancestorId) return true;
        cursor = index.folders.get(cursor)?.parentFolderId ?? null;
      }
      return false;
    };
    const root: Target = { id: null, label: t('move.root'), path: '', kind: 'root' };
    const folders = [...index.folders.values()]
      .filter(
        (f) => visibleFolder(f.id) && !(request.kind === 'folder' && isInside(f.id, request.id)),
      )
      .map<Target>((f) => ({
        id: f.id,
        label: f.name,
        path: folderPath(f.parentFolderId),
        kind: 'folder',
      }));
    const notebooks = [...index.notebooks.values()]
      .filter((n) => n.trashed === 0 && (n.folderId === null || visibleFolder(n.folderId)))
      .map<Target>((n) => ({
        id: n.id,
        label: n.title,
        path: folderPath(n.folderId),
        kind: 'notebook',
      }));
    const pages = [...index.pages.values()]
      .filter((p) => p.trashed === 0 && p.id !== request.id && index.pathTo(p.id).length > 0)
      .map<Target>((p) => ({
        id: p.id,
        label: p.title || t('tree.untitled'),
        path: index
          .pathTo(p.id)
          .slice(0, -1)
          .map((i) => i.name)
          .join(' / '),
        kind: 'page',
      }));
    switch (request.kind) {
      case 'folder':
      case 'notebook':
        return [root, ...folders];
      case 'page':
        return notebooks;
      case 'block':
        return pages;
      default:
        return []; // datasets and rows are not moved through this dialog
    }
  }, [request, index, t]);

  const filtered = targets.filter(
    (target) => !query || foldText(`${target.label} ${target.path}`).includes(foldText(query)),
  );

  const choose = async (target: Target) => {
    if (!request) return;
    const result = request.restoreBatchId
      ? await run({
          type: 'restore',
          workspaceId: workspace.id,
          batchId: request.restoreBatchId,
          ...(target.id ? { targetParentId: target.id } : {}),
        })
      : await run({
          type: 'move',
          workspaceId: workspace.id,
          kind: request.kind,
          id: request.id,
          parentId: target.id,
        });
    if (result) {
      onClose();
      onDone?.();
    }
  };

  const icon = (kind: Target['kind']) =>
    kind === 'root' ? (
      <Home size={16} />
    ) : kind === 'folder' ? (
      <FolderIcon size={16} />
    ) : kind === 'notebook' ? (
      <BookOpen size={16} />
    ) : (
      <FileText size={16} />
    );

  return (
    <Dialog
      open={request !== null}
      title={
        request?.restoreBatchId
          ? t('trash.restoreTarget')
          : t('move.title', { name: request?.name ?? '' })
      }
      onClose={onClose}
    >
      <input
        className="input"
        autoFocus
        aria-label={t('move.filter')}
        placeholder={t('move.filter')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {filtered.length === 0 ? (
        <p className="muted">{t('move.noTargets')}</p>
      ) : (
        <ul className="target-list">
          {filtered.map((target) => (
            <li key={target.id ?? 'root'}>
              <button type="button" className="target" onClick={() => void choose(target)}>
                <span className="menu-icon" aria-hidden="true">
                  {icon(target.kind)}
                </span>
                <span className="target-label">{target.label}</span>
                {target.path && <span className="target-path">{target.path}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
