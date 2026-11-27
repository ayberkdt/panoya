/**
 * Turkish-aware text folding for client-side matching: NFC, tr-TR lowercase (İ→i, I→ı), then a
 * secondary accent-insensitive key so "ogrenci" finds "Öğrenci". Exact matching stays possible
 * by comparing un-folded strings.
 */
export function foldText(value: string): string {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}
