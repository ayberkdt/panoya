/**
 * Which workspace this device opens (per-device UI state, not shared data). Switching reloads the
 * app so every service (store subscriptions, search index, drafts) starts clean for that workspace.
 */
const KEY = 'panoya:workspace';

export function selectedWorkspaceId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function switchWorkspace(workspaceId: string): void {
  try {
    localStorage.setItem(KEY, workspaceId);
  } catch {
    // Without storage the default (first) workspace opens.
  }
  window.location.assign('/');
}
