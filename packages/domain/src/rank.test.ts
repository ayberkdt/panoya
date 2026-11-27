import { describe, expect, it } from 'vitest';
import { compareRanked, isValidRank, rankBetween, ranksBetween, sortByRank } from './rank';

describe('rank', () => {
  it('generates strictly increasing ranks between neighbours', () => {
    const a = rankBetween(null, null);
    const b = rankBetween(a, null);
    const mid = rankBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
    expect([a, mid, b].every(isValidRank)).toBe(true);
  });

  it('keeps inserting at the front valid and ordered (property-style sweep)', () => {
    let first = rankBetween(null, null);
    const ranks = [first];
    for (let i = 0; i < 200; i++) {
      first = rankBetween(null, first);
      ranks.unshift(first);
    }
    const sorted = [...ranks].sort();
    expect(sorted).toEqual(ranks);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it('repeated midpoint insertion never collides', () => {
    const lo = rankBetween(null, null);
    let hi = rankBetween(lo, null);
    for (let i = 0; i < 50; i++) {
      const m = rankBetween(lo, hi);
      expect(lo < m && m < hi).toBe(true);
      hi = m;
    }
  });

  it('breaks rank ties by id deterministically', () => {
    const items = [
      { id: 'b', rank: 'a0' },
      { id: 'a', rank: 'a0' },
      { id: 'c', rank: 'Zz' },
    ];
    expect(sortByRank(items).map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(compareRanked(items[0]!, items[1]!)).toBe(1);
  });

  it('produces evenly spread keys for rebalancing', () => {
    const keys = ranksBetween(null, null, 10);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(10);
  });

  it('rejects malformed ranks', () => {
    expect(isValidRank('')).toBe(false);
    expect(() => rankBetween('b', 'a')).toThrow();
  });
});
