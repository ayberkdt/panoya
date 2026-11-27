import { useCallback, useSyncExternalStore } from 'react';
import type { SaveState } from '@panoya/storage';

export interface DraftHandlers {
  flush: () => Promise<void>;
  keepMine: () => void;
  takeTheirs: () => void;
  retry: () => void;
}

interface Entry {
  state: SaveState;
  handlers: DraftHandlers;
}

const severity: Record<SaveState, number> = {
  idle: 0,
  saved: 1,
  editing: 2,
  saving: 3,
  conflict: 4,
  error: 5,
};

/**
 * Aggregates the autosave state of every mounted editor so the header can show one honest
 * indicator, block frames can offer conflict/error recovery, and navigation can flush first.
 */
export class SaveTracker {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private lastSettled: SaveState = 'idle';

  set(id: string, state: SaveState, handlers: DraftHandlers): void {
    this.entries.set(id, { state, handlers });
    if (state === 'saved') this.lastSettled = 'saved';
    this.emit();
  }

  remove(id: string): void {
    if (this.entries.delete(id)) this.emit();
  }

  get(id: string): Entry | undefined {
    return this.entries.get(id);
  }

  /** The most severe current state; "saved" once something saved and nothing is pending. */
  aggregate(): SaveState {
    let worst: SaveState = 'idle';
    for (const { state } of this.entries.values())
      if (severity[state] > severity[worst]) worst = state;
    return worst === 'idle' ? this.lastSettled : worst;
  }

  hasUnsaved(): boolean {
    return [...this.entries.values()].some((e) => severity[e.state] >= severity.editing);
  }

  async flushAll(): Promise<void> {
    await Promise.all(
      [...this.entries.values()].map((e) => e.handlers.flush().catch(() => undefined)),
    );
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const l of [...this.listeners]) l();
  }
}

export function useAggregateSaveState(tracker: SaveTracker): SaveState {
  return useSyncExternalStore(tracker.subscribe, () => tracker.aggregate());
}

export function useBlockSaveState(tracker: SaveTracker, blockId: string): Entry | undefined {
  const get = useCallback(() => tracker.get(blockId), [tracker, blockId]);
  return useSyncExternalStore(tracker.subscribe, get);
}
