/**
 * Turkish-aware folding with an index map back to the original string (for highlighting).
 *
 * Primary key: NFC + tr-TR lowercase (İ→i, I→ı). Secondary (accent-insensitive) key additionally
 * maps ı→i and strips combining marks, so "ogrenci" matches "Öğrenci" while an exact query still
 * ranks exact spellings higher (see index scoring).
 */
export interface Folded {
  text: string;
  /** map[i] = index in the original string of folded character i */
  map: number[];
}

const cache = new Map<string, string>();

function foldChar(ch: string): string {
  const hit = cache.get(ch);
  if (hit !== undefined) return hit;
  const lower = ch.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i');
  const folded = lower.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (cache.size < 4096) cache.set(ch, folded);
  return folded;
}

export function foldWithMap(input: string): Folded {
  const source = input.normalize('NFC');
  let text = '';
  const map: number[] = [];
  let i = 0;
  for (const ch of source) {
    const f = foldChar(ch);
    for (let k = 0; k < f.length; k++) map.push(i);
    text += f;
    i += ch.length;
  }
  return { text, map };
}

export function fold(input: string): string {
  return foldWithMap(input).text;
}

/** Exact (non accent-folded) key: NFC + Turkish lowercase only. */
export function exactKey(input: string): string {
  return input.normalize('NFC').toLocaleLowerCase('tr-TR');
}

const TOKEN = /[\p{L}\p{N}]+/gu;

/** Tokens of an already folded string, with their start offsets. */
export function tokensWithOffsets(folded: string): { token: string; start: number }[] {
  const out: { token: string; start: number }[] = [];
  for (const m of folded.matchAll(TOKEN)) out.push({ token: m[0], start: m.index });
  return out;
}

export function tokenize(input: string): string[] {
  return tokensWithOffsets(fold(input)).map((t) => t.token);
}
