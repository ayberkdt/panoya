// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { menuHeight, placeMenu } from './menuPlacement';

function anchorAt(top: number, height = 40, clipBox?: { top: number; bottom: number }) {
  const parent = document.createElement('div');
  if (clipBox) {
    parent.style.overflowY = 'auto';
    parent.getBoundingClientRect = () => ({ top: clipBox.top, bottom: clipBox.bottom }) as DOMRect;
  }
  const el = document.createElement('button');
  el.getBoundingClientRect = () => ({ top, bottom: top + height }) as DOMRect;
  parent.appendChild(el);
  document.body.appendChild(parent);
  return el;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('menu placement', () => {
  it('opens downwards at full height when the menu fits under the anchor', () => {
    window.innerHeight = 900;
    expect(placeMenu(anchorAt(100), 300)).toEqual({ side: 'down', maxHeight: 300 });
  });

  it('opens upwards near the bottom of the window when it fits above', () => {
    window.innerHeight = 900;
    expect(placeMenu(anchorAt(820), 440)).toEqual({ side: 'up', maxHeight: 440 });
  });

  it('on a short screen picks the larger side and caps the height to it', () => {
    window.innerHeight = 640;
    // 400 px above (minus 8 gap), 200 px below: neither fits 440 → up, 392 px tall
    expect(placeMenu(anchorAt(400), 440)).toEqual({ side: 'up', maxHeight: 392 });
  });

  it('stays downwards inside a scroll box that has no room above (sidebar tree)', () => {
    window.innerHeight = 720;
    const p = placeMenu(anchorAt(330, 36, { top: 300, bottom: 720 }), menuHeight(6));
    expect(p.side).toBe('down');
    expect(p.maxHeight).toBe(menuHeight(6));
  });

  it('estimates menu height from item count, capped at 440 px', () => {
    expect(menuHeight(3)).toBe(124);
    expect(menuHeight(40)).toBe(440);
  });
});
