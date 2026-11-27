import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  buildTree,
  pathToPage,
  type Folder,
  type Notebook,
  type Page,
  type PathItem,
  type TreeNode,
} from '@panoya/domain';
import { useServices, useStoreQuery } from './services';

export interface WorkspaceIndex {
  loading: boolean;
  tree: TreeNode[];
  folders: Map<string, Folder>;
  notebooks: Map<string, Notebook>;
  pages: Map<string, Page>;
  pathTo(pageId: string): PathItem[];
}

const WorkspaceDataContext = createContext<WorkspaceIndex | null>(null);

/** Folder/notebook/page records of the workspace, reloaded after structural changes. */
export function WorkspaceDataProvider({ children }: { children: ReactNode }) {
  const { store, workspace } = useServices();
  const { data, loading } = useStoreQuery(
    () => store.workspaceData(workspace.id),
    (change) =>
      change.workspaceId === workspace.id &&
      (change.kinds.has('folder') || change.kinds.has('notebook') || change.kinds.has('page')),
    [workspace.id],
  );
  const value = useMemo<WorkspaceIndex>(() => {
    const folders = new Map((data?.folders ?? []).map((f) => [f.id, f]));
    const notebooks = new Map((data?.notebooks ?? []).map((n) => [n.id, n]));
    const pages = new Map((data?.pages ?? []).map((p) => [p.id, p]));
    return {
      loading,
      tree: data ? buildTree(data.folders, data.notebooks, data.pages) : [],
      folders,
      notebooks,
      pages,
      pathTo: (pageId) => pathToPage(pageId, folders, notebooks, pages),
    };
  }, [data, loading]);
  return <WorkspaceDataContext.Provider value={value}>{children}</WorkspaceDataContext.Provider>;
}

export function useWorkspaceIndex(): WorkspaceIndex {
  const value = useContext(WorkspaceDataContext);
  if (!value) throw new Error('WorkspaceDataProvider missing');
  return value;
}
