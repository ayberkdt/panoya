import { useSyncExternalStore } from 'react';

/**
 * Minimal history-API router. Identity is always the stable id, never the title (spec 07).
 *   /w/:workspaceId/p/:pageId   page
 *   /w/:workspaceId/trash       trash
 *   /                           home
 */
export type Route =
  | { name: 'home' }
  | { name: 'page'; workspaceId: string; pageId: string }
  | { name: 'trash'; workspaceId: string };

const UUID = '[0-9a-fA-F-]{36}';

export function parseRoute(pathname: string): Route {
  const page = new RegExp(`^/w/(${UUID})/p/(${UUID})/?$`).exec(pathname);
  if (page) return { name: 'page', workspaceId: page[1] as string, pageId: page[2] as string };
  const trash = new RegExp(`^/w/(${UUID})/trash/?$`).exec(pathname);
  if (trash) return { name: 'trash', workspaceId: trash[1] as string };
  return { name: 'home' };
}

export function routePath(route: Route): string {
  switch (route.name) {
    case 'page':
      return `/w/${route.workspaceId}/p/${route.pageId}`;
    case 'trash':
      return `/w/${route.workspaceId}/trash`;
    case 'home':
      return '/';
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') window.addEventListener('popstate', notify);

export function navigate(route: Route, options: { replace?: boolean } = {}): void {
  const path = routePath(route);
  if (path === window.location.pathname) return;
  if (options.replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRoute(): Route {
  const pathname = useSyncExternalStore(
    subscribe,
    () => window.location.pathname,
    () => '/',
  );
  return parseRoute(pathname);
}

/** Per-device UI state (not shared entity data): the last opened page. */
const LAST_PAGE_KEY = 'panoya:lastPage';
export const lastPage = {
  get(workspaceId: string): string | null {
    try {
      const raw = localStorage.getItem(LAST_PAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      return parsed[workspaceId] ?? null;
    } catch {
      return null;
    }
  },
  set(workspaceId: string, pageId: string): void {
    try {
      localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({ [workspaceId]: pageId }));
    } catch {
      // Storage may be unavailable (private mode); this is only a convenience.
    }
  },
};
