import type { BlockRegistry } from '@panoya/blocks';
import type { Block } from '@panoya/domain';
import {
  blockDoc,
  containerDocs,
  SearchIndex,
  type SearchHit,
  type ParsedQuery,
} from '@panoya/search';
import type { ChangeSet, WorkspaceStore } from '@panoya/storage';

export type SearchStatus = 'building' | 'ready' | 'error';

/**
 * Keeps a derived, disposable search index in sync with committed records (spec 09). Built in
 * the background after start; container renames/moves refresh the paths of their blocks; block
 * changes are applied by id. Queries never leave the device.
 */
export class SearchService {
  readonly index = new SearchIndex();
  private blocks = new Map<string, Block>();
  private pagePaths = new Map<string, string[]>();
  private statusValue: SearchStatus = 'building';
  private readonly listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private version = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly store: WorkspaceStore,
    private readonly registry: BlockRegistry,
    private readonly workspaceId: string,
  ) {}

  get status(): SearchStatus {
    return this.statusValue;
  }

  /** Increments on every index change so views can re-run their query. */
  get revision(): number {
    return this.version;
  }

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.store.subscribe((change) => this.enqueue(() => this.apply(change)));
    this.enqueue(() => this.rebuild());
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  search(query: string | ParsedQuery, limit = 30): { hits: SearchHit[]; query: ParsedQuery } {
    return this.index.search(query, { limit });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch(() => {
      this.statusValue = 'error';
      this.emit();
    });
  }

  private emit(): void {
    this.version++;
    for (const l of [...this.listeners]) l();
  }

  private async rebuild(): Promise<void> {
    const [records, blocks] = await Promise.all([
      this.store.workspaceData(this.workspaceId),
      this.store.backend.blocksOfWorkspace(this.workspaceId),
    ]);
    this.blocks = new Map(blocks.map((b) => [b.id, b]));
    this.reindexContainers(records);
    this.statusValue = 'ready';
    this.emit();
  }

  private reindexContainers(records: Awaited<ReturnType<WorkspaceStore['workspaceData']>>): void {
    const { docs, pagePaths } = containerDocs(records);
    this.pagePaths = pagePaths;
    const keep = new Set<string>();
    for (const doc of docs) {
      this.index.upsert(doc);
      keep.add(doc.id);
    }
    // Blocks follow their page: re-path, or drop when the page is hidden/trashed.
    for (const block of this.blocks.values()) {
      const doc = this.docForBlock(block);
      if (doc) {
        this.index.upsert(doc);
        keep.add(doc.id);
      }
    }
    this.index.retainOnly(keep);
  }

  private docForBlock(block: Block) {
    const path = this.pagePaths.get(block.pageId);
    return path ? blockDoc(block, this.registry, path) : null;
  }

  private async apply(change: ChangeSet): Promise<void> {
    if (change.workspaceId !== this.workspaceId || this.statusValue !== 'ready') return;
    if (change.kinds.has('block')) {
      for (const id of change.ids) {
        const block = await this.store.backend.get('block', id);
        if (block) this.blocks.set(id, block);
        else if (this.blocks.has(id)) this.blocks.delete(id);
        else continue;
        const doc = block ? this.docForBlock(block) : null;
        if (doc) this.index.upsert(doc);
        else this.index.remove(id);
      }
    }
    if (change.kinds.has('folder') || change.kinds.has('notebook') || change.kinds.has('page')) {
      this.reindexContainers(await this.store.workspaceData(this.workspaceId));
    }
    this.emit();
  }
}
