/**
 * How long an informational toast stays: 1.5 s to notice it plus 0.3 s per word (≈ 200 words per
 * minute, slow on purpose: it is read in passing), never under 3 s or over 10 s. A one-word
 * "Kopyalandı" leaves after 3 s; a two-sentence CSV warning stays about 5 s.
 */
export function readingTime(message: string): number {
  const words = message.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(10_000, Math.max(3_000, 1_500 + words * 300));
}
