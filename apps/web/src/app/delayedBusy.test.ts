import { describe, expect, it } from 'vitest';
import { busyStage } from './delayedBusy';

describe('waiting thresholds', () => {
  it('stays silent under 400 ms and escalates at 3 s, 8 s and 10 s', () => {
    expect(busyStage(0, false)).toBe('idle');
    expect(busyStage(399, true)).toBe('quiet');
    expect(busyStage(400, true)).toBe('show');
    expect(busyStage(2999, true)).toBe('show');
    expect(busyStage(3000, true)).toBe('slow');
    expect(busyStage(8000, true)).toBe('verySlow');
    expect(busyStage(10_000, true)).toBe('offerCancel');
  });
});
