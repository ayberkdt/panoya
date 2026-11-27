import { describe, expect, it } from 'vitest';
import { readingTime } from './readingTime';

describe('toast reading time', () => {
  it('keeps short messages for the 3 s floor', () => {
    expect(readingTime('Kopyalandı')).toBe(3_000);
    expect(readingTime('CSV indirildi')).toBe(3_000);
  });

  it('gives longer messages time to be read', () => {
    const warning = "CSV indirildi. Formül gibi başlayan 1 hücrenin başına ' eklendi.";
    // 10 whitespace-separated parts (the lone quote mark counts as one)
    expect(readingTime(warning)).toBe(1_500 + 10 * 300);
  });

  it('never stays longer than 10 s', () => {
    expect(readingTime('söz '.repeat(100))).toBe(10_000);
  });
});
