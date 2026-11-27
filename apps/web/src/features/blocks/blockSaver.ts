import { AutosaveScheduler, type WorkspaceStore } from '@panoya/storage';

/**
 * Framework-free autosave state for one block: the revision the draft is based on and the
 * debounced scheduler that commits it through `updateBlock` (optimistic concurrency).
 */
export class BlockSaver<P> {
  private revision: number;
  /** Incremented on every mount so a delayed unmount cleanup cannot stop a remounted saver. */
  private mountGeneration = 0;
  readonly scheduler: AutosaveScheduler<P>;

  constructor(
    store: WorkspaceStore,
    private readonly workspaceId: string,
    private readonly blockId: string,
    initialRevision: number,
  ) {
    this.revision = initialRevision;
    this.scheduler = new AutosaveScheduler<P>({
      save: async (payload) => {
        const result = await store.execute({
          type: 'updateBlock',
          workspaceId: this.workspaceId,
          id: this.blockId,
          payload,
          expectedRevision: this.revision,
        });
        const saved = result.records.get(this.blockId);
        if (saved) this.revision = saved.localRevision;
      },
    });
  }

  /**
   * A stored revision arrived (other tab, undo/redo). Returns true when the view should replace
   * its value with the stored payload — only if there is no unsaved local draft.
   */
  acceptExternal(storedRevision: number): boolean {
    if (storedRevision === this.revision || this.scheduler.hasUnsaved()) return false;
    this.revision = storedRevision;
    return true;
  }

  /** Called when the owning component mounts; returns a token for `isCurrentMount`. */
  mount(): number {
    this.scheduler.revive();
    this.mountGeneration += 1;
    return this.mountGeneration;
  }

  isCurrentMount(token: number): boolean {
    return token === this.mountGeneration;
  }

  /** Conflict: overwrite the stored version with the local draft. */
  keepMine(storedRevision: number): void {
    this.revision = storedRevision;
    this.scheduler.resume();
  }

  /** Conflict: drop the local draft in favour of the stored version. */
  takeTheirs(storedRevision: number): void {
    this.revision = storedRevision;
    this.scheduler.discard();
  }
}
