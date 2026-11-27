/** Nearest ancestor that clips its children (a scroll box such as the sidebar tree). */
function clipBounds(el: Element): { top: number; bottom: number } {
  let bounds = { top: 0, bottom: window.innerHeight };
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowY)) {
      const r = p.getBoundingClientRect();
      bounds = { top: Math.max(r.top, 0), bottom: Math.min(r.bottom, window.innerHeight) };
      break;
    }
  }
  return bounds;
}

export interface Placement {
  side: 'up' | 'down';
  /** Max height in px so the popup never leaves the box that would clip it. */
  maxHeight: number;
}

const GAP = 8;
export const DEFAULT_PLACEMENT: Placement = { side: 'down', maxHeight: 440 };

/**
 * Where a popup opens, measured inside the box that would clip it: down when it fits there, up
 * when it only fits above (the page's last "Blok ekle" button), otherwise towards the larger
 * space with its height capped so it scrolls inside instead of being cut off (short laptop
 * screens). Phones render menus as bottom sheets, so this only matters on wider layouts.
 */
export function placeMenu(anchor: Element | null, height: number): Placement {
  if (!anchor || typeof window === 'undefined') return DEFAULT_PLACEMENT;
  const rect = anchor.getBoundingClientRect();
  const clip = clipBounds(anchor);
  const below = clip.bottom - rect.bottom - GAP;
  const above = rect.top - clip.top - GAP;
  const side = below >= height ? 'down' : above >= height || above > below ? 'up' : 'down';
  const room = side === 'up' ? above : below;
  return { side, maxHeight: Math.max(160, Math.min(height, room)) };
}

/** Estimated menu height: 36 px rows plus padding (no layout read before it renders). */
export const menuHeight = (items: number) => Math.min(440, items * 36 + 16);
