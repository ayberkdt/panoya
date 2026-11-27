import { docFromText, checkUrl, titleFromUrl } from '@panoya/blocks';
import { sortByRank, type Workspace } from '@panoya/domain';
import type { WorkspaceStore } from '@panoya/storage';

export const INBOX_ICON = 'inbox';

/**
 * Returns the Inbox page, creating the Inbox notebook/page on first use. Identified by the
 * notebook icon marker, so renaming it never breaks capture. Idempotent.
 */
export async function ensureInboxPage(
  store: WorkspaceStore,
  workspace: Workspace,
  names: { notebook: string; page: string },
): Promise<string> {
  const data = await store.workspaceData(workspace.id);
  let notebook = sortByRank(
    data.notebooks.filter((n) => n.trashed === 0 && n.folderId === null && n.icon === INBOX_ICON),
  )[0];
  if (!notebook) {
    const created = await store.execute({
      type: 'createNotebook',
      workspaceId: workspace.id,
      folderId: null,
      title: names.notebook,
      icon: INBOX_ICON,
      placement: { kind: 'start' },
    });
    notebook = created.records.get(created.mutation.primary!.id) as typeof notebook;
  }
  const page = sortByRank(
    data.pages.filter((p) => p.trashed === 0 && p.notebookId === notebook!.id),
  )[0];
  if (page) return page.id;
  const created = await store.execute({
    type: 'createPage',
    workspaceId: workspace.id,
    notebookId: notebook!.id,
    title: names.page,
  });
  return created.mutation.primary!.id;
}

/** A captured line becomes a link block when it is exactly one safe URL, else a text block. */
export function captureToBlock(text: string): { type: string; payload: unknown } {
  const trimmed = text.trim();
  const url = /^\S+$/.test(trimmed) ? checkUrl(trimmed) : null;
  if (url?.ok) {
    return {
      type: 'link',
      payload: {
        title: titleFromUrl(url.href),
        url: url.href,
        description: '',
        category: '',
        tags: [],
      },
    };
  }
  return { type: 'richText', payload: { doc: docFromText(text) } };
}
