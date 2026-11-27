import type { OptionColor } from '@panoya/domain';

/** Colours a folder can get: no gray or brown (read as no colour), no red (reads as an error). */
const ENTITY_COLORS: OptionColor[] = ['blue', 'green', 'orange', 'purple', 'pink', 'yellow'];

/**
 * Stable colour for a folder or notebook, derived from its id (FNV-1a), so it is the same on
 * every device and never needs storing. Pages take the colour of their top folder.
 */
export function entityColor(id: string): OptionColor {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ENTITY_COLORS[(h >>> 0) % ENTITY_COLORS.length] as OptionColor;
}
