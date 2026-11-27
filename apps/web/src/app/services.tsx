import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BlockRegistry } from '@panoya/blocks';
import type { DomainCommand, Workspace } from '@panoya/domain';
import type { ChangeSet, CommandResult, WorkspaceStore } from '@panoya/storage';
import { useI18n } from '../i18n';
import { useToast } from '../components/Toasts';
import type { SaveTracker } from './saveTracker';

export interface Services {
  store: WorkspaceStore;
  registry: BlockRegistry;
  workspace: Workspace;
  saveTracker: SaveTracker;
}

const ServicesContext = createContext<Services | null>(null);

export function ServicesProvider({ value, children }: { value: Services; children: ReactNode }) {
  return <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>;
}

export function useServices(): Services {
  const value = useContext(ServicesContext);
  if (!value) throw new Error('ServicesProvider missing');
  return value;
}

/**
 * Executes domain commands and turns failures into visible, translated messages. Returns null on
 * failure so callers can keep local drafts.
 */
export function useRunCommand(): (command: DomainCommand) => Promise<CommandResult | null> {
  const { store } = useServices();
  const toast = useToast();
  const { errorText } = useI18n();
  return useCallback(
    async (command: DomainCommand) => {
      try {
        return await store.execute(command);
      } catch (error) {
        toast.show({ message: errorText(error), tone: 'error' });
        return null;
      }
    },
    [store, toast, errorText],
  );
}

/**
 * Loads data from the store and reloads it when a relevant change is committed (locally or in
 * another tab). Stale responses from superseded loads are ignored; `loading` is true until the
 * data for the current `deps` arrived.
 */
export function useStoreQuery<T>(
  load: () => Promise<T>,
  isRelevant: (change: ChangeSet) => boolean,
  deps: readonly unknown[],
): { data: T | undefined; loading: boolean; error: unknown } {
  const { store } = useServices();
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string | null; data: T | undefined; error: unknown }>({
    key: null,
    data: undefined,
    error: undefined,
  });
  const callbacks = useRef({ load, isRelevant });
  useEffect(() => {
    callbacks.current = { load, isRelevant };
  });

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const run = () => {
      const current = ++generation;
      callbacks.current.load().then(
        (data) => {
          if (!disposed && current === generation) setState({ key, data, error: undefined });
        },
        (error: unknown) => {
          if (!disposed && current === generation) setState((s) => ({ ...s, key, error }));
        },
      );
    };
    run();
    const off = store.subscribe((change) => {
      if (callbacks.current.isRelevant(change)) run();
    });
    return () => {
      disposed = true;
      off();
    };
  }, [store, key]);

  const fresh = state.key === key;
  return {
    data: fresh ? state.data : undefined,
    loading: !fresh,
    error: fresh ? state.error : undefined,
  };
}
