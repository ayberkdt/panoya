import { describe, expect, it } from 'vitest';
import { activeScrollLocks, lockScroll } from './scrollLock';

describe('scroll lock', () => {
  it('is reference counted and restores the previous overflow', () => {
    document.body.style.overflow = 'auto';
    const a = lockScroll();
    const b = lockScroll();
    expect(document.body.style.overflow).toBe('hidden');
    expect(activeScrollLocks()).toBe(2);
    a();
    a(); // releasing twice is harmless
    expect(document.body.style.overflow).toBe('hidden');
    b();
    expect(activeScrollLocks()).toBe(0);
    expect(document.body.style.overflow).toBe('auto');
  });
});
