import { useCallback } from 'react';
import type { EntityKind } from '@panoya/domain';
import { useToast } from '../components/Toasts';
import { useI18n } from '../i18n';
import { useRunCommand, useServices } from './services';

/** Undo / redo of the global command history with visible feedback. */
export function useHistoryActions() {
  const { store, workspace, saveTracker } = useServices();
  const toast = useToast();
  const { t, errorText } = useI18n();
  const undo = useCallback(async () => {
    await saveTracker.flushAll();
    try {
      const result = await store.undo(workspace.id);
      toast.show({ message: t(result ? 'toast.undone' : 'toast.nothingToUndo') });
    } catch (error) {
      toast.show({ message: errorText(error), tone: 'error' });
    }
  }, [store, workspace.id, saveTracker, toast, t, errorText]);
  const redo = useCallback(async () => {
    try {
      const result = await store.redo(workspace.id);
      if (result) toast.show({ message: t('toast.redone') });
    } catch (error) {
      toast.show({ message: errorText(error), tone: 'error' });
    }
  }, [store, workspace.id, toast, t, errorText]);
  return { undo, redo };
}

/** Moves an item (and its subtree) to the trash and offers an immediate undo. */
export function useTrash() {
  const run = useRunCommand();
  const { workspace, saveTracker } = useServices();
  const toast = useToast();
  const { t } = useI18n();
  const { undo } = useHistoryActions();
  return useCallback(
    async (kind: EntityKind, id: string, name: string) => {
      await saveTracker.flushAll();
      const result = await run({ type: 'trash', workspaceId: workspace.id, kind, id });
      if (result)
        toast.show({
          message: t('toast.trashed', { name }),
          action: { label: t('toast.undo'), run: () => void undo() },
        });
      return result !== null;
    },
    [run, workspace.id, saveTracker, toast, t, undo],
  );
}
