/**
 * Side-effect sources injected into pure domain code so that tests can be deterministic.
 */
export interface Clock {
  /** Current instant as an ISO-8601 UTC string. */
  now(): string;
}

export interface IdSource {
  newId(): string;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

interface CryptoLike {
  randomUUID(): string;
}

export const cryptoIds: IdSource = {
  newId: () => (globalThis as unknown as { crypto: CryptoLike }).crypto.randomUUID(),
};

/** Deterministic clock for tests: every call advances by `stepMs`. */
export function fixedClock(startIso: string, stepMs = 1): Clock {
  let t = Date.parse(startIso);
  return {
    now: () => {
      const value = new Date(t).toISOString();
      t += stepMs;
      return value;
    },
  };
}

/** Deterministic UUID-shaped ids for tests. */
export function sequentialIds(prefix = '00000000-0000-4000-8000'): IdSource {
  let n = 0;
  return {
    newId: () => {
      n += 1;
      return `${prefix}-${n.toString(16).padStart(12, '0')}`;
    },
  };
}
