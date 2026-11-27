import { useEffect, useState } from 'react';

/**
 * Waiting feedback thresholds (decision adopted from Paritera's "bekleme" research notes, based on
 * NN/g response-time limits): nothing below 400 ms (no flicker), an indicator from 400 ms, more
 * explanatory copy at 3 s and 8 s, and a way out from 10 s when the task can be abandoned.
 */
export type BusyStage = 'idle' | 'quiet' | 'show' | 'slow' | 'verySlow' | 'offerCancel';

export const BUSY_THRESHOLDS = { show: 400, slow: 3000, verySlow: 8000, cancel: 10_000 } as const;

export function busyStage(elapsedMs: number, active: boolean): BusyStage {
  if (!active) return 'idle';
  if (elapsedMs >= BUSY_THRESHOLDS.cancel) return 'offerCancel';
  if (elapsedMs >= BUSY_THRESHOLDS.verySlow) return 'verySlow';
  if (elapsedMs >= BUSY_THRESHOLDS.slow) return 'slow';
  if (elapsedMs >= BUSY_THRESHOLDS.show) return 'show';
  return 'quiet';
}

export function useBusyStage(active: boolean): BusyStage {
  const [stage, setStage] = useState<BusyStage>(active ? 'quiet' : 'idle');
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    setStage(active ? 'quiet' : 'idle');
  }
  useEffect(() => {
    if (!active) return;
    const steps: [number, BusyStage][] = [
      [BUSY_THRESHOLDS.show, 'show'],
      [BUSY_THRESHOLDS.slow, 'slow'],
      [BUSY_THRESHOLDS.verySlow, 'verySlow'],
      [BUSY_THRESHOLDS.cancel, 'offerCancel'],
    ];
    const timers = steps.map(([ms, next]) => setTimeout(() => setStage(next), ms));
    return () => timers.forEach(clearTimeout);
  }, [active]);
  return stage;
}
