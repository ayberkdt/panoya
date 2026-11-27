import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainError } from '@panoya/domain';
import { AutosaveScheduler, type SaveState } from './autosave';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(
  save: (v: string) => Promise<void>,
  extra: Partial<ConstructorParameters<typeof AutosaveScheduler<string>>[0]> = {},
) {
  const states: SaveState[] = [];
  const scheduler = new AutosaveScheduler<string>({
    save,
    onState: (s) => states.push(s),
    ...extra,
  });
  return { scheduler, states };
}

describe('AutosaveScheduler', () => {
  it('debounces bursts of typing into one save of the latest value', async () => {
    const save = vi.fn(async () => undefined);
    const { scheduler, states } = setup(save);
    scheduler.update('a');
    scheduler.update('ab');
    scheduler.update('abc');
    await vi.advanceTimersByTimeAsync(299);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('abc');
    expect(states.at(-1)).toBe('saved');
  });

  it('saves at most maxWait after the first edit while typing continues', async () => {
    const save = vi.fn(async () => undefined);
    const { scheduler } = setup(save);
    for (let t = 0; t < 2000; t += 100) {
      scheduler.update(`v${t}`);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(save).toHaveBeenCalled();
  });

  it('flush saves immediately', async () => {
    const save = vi.fn(async () => undefined);
    const { scheduler } = setup(save);
    scheduler.update('x');
    await scheduler.flush();
    expect(save).toHaveBeenCalledWith('x');
    expect(scheduler.hasUnsaved()).toBe(false);
  });

  it('never runs two saves concurrently and saves edits made during a save', async () => {
    let active = 0;
    let maxActive = 0;
    const save = vi.fn(async (_value: string) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 500));
      active--;
    });
    const { scheduler } = setup(save);
    scheduler.update('1');
    await vi.advanceTimersByTimeAsync(300);
    scheduler.update('2');
    await vi.advanceTimersByTimeAsync(2000);
    expect(maxActive).toBe(1);
    expect(save.mock.calls.map((c) => c[0])).toEqual(['1', '2']);
    expect(scheduler.state).toBe('saved');
  });

  it('retries transient failures with backoff and keeps the draft on final failure', async () => {
    const save = vi.fn(async () => {
      throw new Error('disk busy');
    });
    const { scheduler } = setup(save, { retries: 2, retryBaseMs: 100 });
    scheduler.update('draft');
    await vi.advanceTimersByTimeAsync(300 + 100 + 200 + 10);
    expect(save).toHaveBeenCalledTimes(3);
    expect(scheduler.state).toBe('error');
    expect(scheduler.draft).toBe('draft');
  });

  it('stops on conflict without retrying and resumes on request', async () => {
    let fail = true;
    const save = vi.fn(async () => {
      if (fail) throw new DomainError('CONFLICT', 'error.block.revisionMismatch');
    });
    const { scheduler } = setup(save);
    scheduler.update('mine');
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(scheduler.state).toBe('conflict');
    expect(scheduler.draft).toBe('mine');
    fail = false;
    scheduler.resume();
    await vi.advanceTimersByTimeAsync(10);
    expect(scheduler.state).toBe('saved');
  });
});

describe('AutosaveScheduler lifecycle', () => {
  it('can be revived after dispose (remount) and saves again', async () => {
    const save = vi.fn(async (_v: string) => undefined);
    const scheduler = new AutosaveScheduler<string>({ save });
    scheduler.dispose();
    scheduler.update('ignored while disposed');
    scheduler.revive();
    scheduler.update('after revive');
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('after revive');
  });
});
