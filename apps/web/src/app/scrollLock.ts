import { useEffect } from 'react';

/**
 * Reference-counted page scroll lock: the page behind a dialog, bottom sheet or drawer must not
 * scroll (pattern adopted from Paritera's scroll-lock decision). Nested popups share one lock;
 * the page unlocks when the last one closes. Scroll containers inside popups keep scrolling.
 */
let locks = 0;
let saved: { html: string; body: string } | null = null;

export function lockScroll(): () => void {
  if (typeof document === 'undefined') return () => undefined;
  if (locks === 0) {
    const { documentElement: html, body } = document;
    saved = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    html.style.setProperty('overscroll-behavior', 'none');
  }
  locks++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0 && saved) {
      document.documentElement.style.overflow = saved.html;
      document.body.style.overflow = saved.body;
      document.documentElement.style.removeProperty('overscroll-behavior');
      saved = null;
    }
  };
}

export function useScrollLock(active: boolean): void {
  useEffect(() => (active ? lockScroll() : undefined), [active]);
}

/** Test helper. */
export function activeScrollLocks(): number {
  return locks;
}
