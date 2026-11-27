import { describe, expect, it } from 'vitest';
import { colorForLabel, optionsFromValues } from './cells';

describe('meaning-based option colours', () => {
  it.each([
    ['Atılmadı', 'gray'],
    ['Yapılmadı', 'gray'],
    ['Gönderildi', 'blue'],
    ['Devam ediyor', 'blue'],
    ['Yanıt bekleniyor', 'yellow'],
    ['Beklemede', 'yellow'],
    ['Olumlu', 'green'],
    ['Onaylandı', 'green'],
    ['Yapıldı', 'green'],
    ['Olumsuz', 'red'],
    ['Reddedildi', 'red'],
    ['Rejected', 'red'],
    ['Done', 'green'],
  ])('%s → %s', (label, color) => {
    expect(colorForLabel(label)).toBe(color);
  });

  it('falls back to a rotation for labels without a known meaning', () => {
    expect(colorForLabel('A')).toBeNull();
    const options = optionsFromValues(['B', 'A', 'Olumsuz', 'C']);
    expect(options.map((o) => o.color)).toEqual(['gray', 'blue', 'red', 'green']);
  });
});
