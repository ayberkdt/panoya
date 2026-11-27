import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { Block } from '@panoya/domain';
import type { SaveState } from '@panoya/storage';
import { useServices } from '../../app/services';
import { BlockSaver } from './blockSaver';

export interface BlockDraft<P> {
  value: P;
  set(next: P): void;
  /** Applies a change and saves without waiting for the debounce (checkbox, delete item). */
  commit(next: P): void;
  state: SaveState;
  flush(): Promise<void>;
}

/**
 * Local draft + autosave for one block. The stored block stays canonical; the draft only lives
 * until it is committed. Conflict and error recovery is exposed through the SaveTracker so the
 * block frame can render it.
 */
export function useBlockDraft<P>(block: Block, payload: P): BlockDraft<P> {
  const { store, workspace, saveTracker } = useServices();
  const [saver] = useState(
    () => new BlockSaver<P>(store, workspace.id, block.id, block.localRevision),
  );
  const [value, setValue] = useState<P>(payload);
  const [seen, setSeen] = useState({ revision: block.localRevision, payload });

  // Stored revision changed (other tab, undo/redo): adopt it unless a local draft is pending.
  if (block.localRevision !== seen.revision) {
    setSeen({ revision: block.localRevision, payload });
    if (saver.acceptExternal(block.localRevision)) setValue(payload);
  }

  const subscribe = useCallback(
    (onChange: () => void) =>
      saver.scheduler.subscribe((state) => {
        saveTracker.set(block.id, state, {
          flush: () => saver.scheduler.flush(),
          keepMine: () => saver.keepMine(seen.revision),
          takeTheirs: () => {
            saver.takeTheirs(seen.revision);
            setValue(seen.payload);
          },
          retry: () => saver.scheduler.resume(),
        });
        onChange();
      }),
    [saver, saveTracker, block.id, seen],
  );
  const state = useSyncExternalStore(subscribe, () => saver.scheduler.state);

  useEffect(() => {
    const token = saver.mount();
    return () => {
      // Unmount (navigation, block removed): save what is pending, then stop — unless React
      // remounted this owner meanwhile (StrictMode, fast refresh).
      void saver.scheduler.flush().finally(() => {
        if (!saver.isCurrentMount(token)) return;
        saver.scheduler.dispose();
        saveTracker.remove(block.id);
      });
    };
  }, [saver, saveTracker, block.id]);

  const set = useCallback(
    (next: P) => {
      setValue(next);
      saver.scheduler.update(next);
    },
    [saver],
  );
  const commit = useCallback(
    (next: P) => {
      setValue(next);
      saver.scheduler.update(next);
      void saver.scheduler.flush();
    },
    [saver],
  );
  const flush = useCallback(() => saver.scheduler.flush(), [saver]);

  return { value, set, commit, state, flush };
}
