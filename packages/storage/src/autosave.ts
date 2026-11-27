import { isDomainError } from '@panoya/domain';

export type SaveState = 'idle' | 'editing' | 'saving' | 'saved' | 'error' | 'conflict';

export interface TimerApi {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AutosaveOptions<T> {
  save: (value: T) => Promise<void>;
  onState?: (state: SaveState, error?: unknown) => void;
  debounceMs?: number;
  /** Upper bound between the first unsaved edit and the save attempt. */
  maxWaitMs?: number;
  retries?: number;
  retryBaseMs?: number;
  timers?: TimerApi;
}

const defaultTimers: TimerApi = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof globalThis.setTimeout>),
};

/**
 * Debounced, serialized autosave for one editable unit (spec 04). Keeps the latest draft in memory
 * until a save succeeds; failures keep the draft and expose `error`/`conflict` instead of "saved".
 */
export class AutosaveScheduler<T> {
  private pending: { value: T } | null = null;
  private inFlight: Promise<void> | null = null;
  private debounceTimer: unknown = null;
  private maxWaitTimer: unknown = null;
  private retryTimer: unknown = null;
  private attempt = 0;
  private disposed = false;
  private stateValue: SaveState = 'idle';
  private readonly listeners = new Set<(state: SaveState, error?: unknown) => void>();
  private lastError: unknown = undefined;

  private readonly debounceMs: number;
  private readonly maxWaitMs: number;
  private readonly retries: number;
  private readonly retryBaseMs: number;
  private readonly timers: TimerApi;

  constructor(private readonly options: AutosaveOptions<T>) {
    this.debounceMs = options.debounceMs ?? 300;
    this.maxWaitMs = options.maxWaitMs ?? 2000;
    this.retries = options.retries ?? 3;
    this.retryBaseMs = options.retryBaseMs ?? 250;
    this.timers = options.timers ?? defaultTimers;
  }

  get state(): SaveState {
    return this.stateValue;
  }

  get error(): unknown {
    return this.lastError;
  }

  /** The unsaved draft, if any (for recovery: copy/export when saving fails). */
  get draft(): T | undefined {
    return this.pending?.value;
  }

  hasUnsaved(): boolean {
    return this.pending !== null;
  }

  update(value: T): void {
    if (this.disposed) return;
    this.pending = { value };
    this.attempt = 0;
    if (this.stateValue !== 'conflict') this.setState('editing');
    this.scheduleDebounce();
    this.maxWaitTimer ??= this.timers.setTimeout(() => {
      this.maxWaitTimer = null;
      void this.run();
    }, this.maxWaitMs);
  }

  /** Save now (blur, navigation, visibility change). Resolves when nothing is pending. */
  async flush(): Promise<void> {
    while (!this.disposed) {
      if (this.inFlight) {
        await this.inFlight;
        continue;
      }
      if (!this.pending || this.stateValue === 'conflict') return;
      await this.run();
      const after: SaveState = this.state; // re-read: run() changes the state asynchronously
      if (after === 'error' || after === 'conflict') return;
    }
  }

  /** Observe state changes (in addition to `options.onState`). */
  subscribe(listener: (state: SaveState, error?: unknown) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Drop the unsaved draft (e.g. "take theirs" after a conflict). */
  discard(): void {
    this.pending = null;
    this.attempt = 0;
    this.clearTimers();
    this.setState('idle');
  }

  /** After a conflict was resolved by the caller, allow saving again (optionally a new value). */
  resume(value?: T): void {
    if (value !== undefined) this.pending = { value };
    this.setState(this.pending ? 'editing' : 'idle');
    if (this.pending) void this.run();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimers();
  }

  /** Re-enable after `dispose()` (React may unmount and remount the same owner). */
  revive(): void {
    this.disposed = false;
    if (this.pending && this.stateValue !== 'conflict') this.scheduleDebounce();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  private scheduleDebounce(): void {
    if (this.debounceTimer !== null) this.timers.clearTimeout(this.debounceTimer);
    this.debounceTimer = this.timers.setTimeout(() => {
      this.debounceTimer = null;
      void this.run();
    }, this.debounceMs);
  }

  private clearTimers(): void {
    for (const t of [this.debounceTimer, this.maxWaitTimer, this.retryTimer]) {
      if (t !== null) this.timers.clearTimeout(t);
    }
    this.debounceTimer = this.maxWaitTimer = this.retryTimer = null;
  }

  private run(): Promise<void> {
    if (this.inFlight || this.disposed || !this.pending || this.stateValue === 'conflict') {
      return this.inFlight ?? Promise.resolve();
    }
    this.clearTimers();
    const job = this.pending;
    this.setState('saving');
    this.inFlight = (async () => {
      try {
        await this.options.save(job.value);
        // Only clear the draft if no newer edit arrived meanwhile.
        if (this.pending === job) this.pending = null;
        this.attempt = 0;
        this.lastError = undefined;
        this.setState(this.pending ? 'editing' : 'saved');
      } catch (error) {
        this.lastError = error;
        if (isDomainError(error) && error.code === 'CONFLICT') {
          this.setState('conflict', error);
        } else if (this.isTransient(error) && this.attempt < this.retries) {
          this.attempt += 1;
          this.setState('saving');
          this.retryTimer = this.timers.setTimeout(
            () => {
              this.retryTimer = null;
              void this.run();
            },
            this.retryBaseMs * 2 ** (this.attempt - 1),
          );
        } else {
          this.setState('error', error);
        }
      } finally {
        this.inFlight = null;
      }
      // Edits that arrived while saving are saved after a fresh debounce.
      if (this.pending && this.stateValue === 'editing' && this.debounceTimer === null)
        this.scheduleDebounce();
    })();
    return this.inFlight;
  }

  private isTransient(error: unknown): boolean {
    if (isDomainError(error)) return error.retryable;
    // Unknown (storage/driver) failures are retried a bounded number of times.
    return true;
  }

  private setState(state: SaveState, error?: unknown): void {
    this.stateValue = state;
    this.options.onState?.(state, error);
    for (const listener of [...this.listeners]) listener(state, error);
  }
}
