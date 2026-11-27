import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { DomainError } from './errors';

/**
 * Lexicographic fractional ranks (ADR-002). Ranks are opaque strings compared with plain
 * code-unit ordering; ties are broken by entity id so ordering is always deterministic.
 */
export const MAX_RANK_LENGTH = 48;

export function rankBetween(before: string | null, after: string | null): string {
  try {
    return generateKeyBetween(before, after);
  } catch (cause) {
    throw new DomainError('INVARIANT', 'error.rank.invalid', { cause });
  }
}

export function ranksBetween(before: string | null, after: string | null, n: number): string[] {
  try {
    return generateNKeysBetween(before, after, n);
  } catch (cause) {
    throw new DomainError('INVARIANT', 'error.rank.invalid', { cause });
  }
}

export function isValidRank(rank: string): boolean {
  if (rank.length === 0 || rank.length > MAX_RANK_LENGTH) return false;
  try {
    generateKeyBetween(rank, null);
    return true;
  } catch {
    return false;
  }
}

/** True when ranks became long enough that the sibling list should be rebalanced. */
export function needsRebalance(rank: string): boolean {
  return rank.length > MAX_RANK_LENGTH / 2;
}

export interface Ranked {
  id: string;
  rank: string;
}

export function compareRanked(a: Ranked, b: Ranked): number {
  if (a.rank < b.rank) return -1;
  if (a.rank > b.rank) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortByRank<T extends Ranked>(items: readonly T[]): T[] {
  return [...items].sort(compareRanked);
}
