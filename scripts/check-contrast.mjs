#!/usr/bin/env node
/**
 * Deterministic contrast gate for the design tokens (WCAG 2.2: 1.4.3 text ≥ 4.5:1,
 * 1.4.11 UI component borders / focus indicator ≥ 3:1). Reads apps/web/src/styles/tokens.css,
 * checks the light (:root) and dark (prefers-color-scheme) values, exits 1 on any failure.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  fileURLToPath(new URL('../apps/web/src/styles/tokens.css', import.meta.url)),
  'utf8',
);
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const parse = (text) =>
  Object.fromEntries(
    [...text.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]),
  );
const light = parse(css.slice(0, darkStart));
const dark = { ...light, ...parse(css.slice(darkStart)) };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const pairs = [
  ['text', 'surface', 4.5],
  ['text', 'bg', 4.5],
  ['text', 'surface-2', 4.5],
  ['text-2', 'surface', 4.5],
  ['text-2', 'bg', 4.5],
  ['text-2', 'surface-2', 4.5],
  ['accent-text', 'accent', 4.5],
  ['accent', 'surface', 4.5],
  ['accent', 'bg', 4.5],
  ['accent-ink', 'accent-soft', 4.5],
  ['danger', 'surface', 4.5],
  ['warn-text', 'warn-bg', 4.5],
  ['field', 'surface', 3],
  ['field', 'bg', 3],
  ['focus', 'bg', 3],
  ['focus', 'surface', 3],
  // v2 tokens: table header and read-only areas, link host, destructive hover
  ['text', 'surface-sunken', 4.5],
  ['text-2', 'surface-sunken', 4.5],
  ['accent-ink', 'surface', 4.5],
  ['accent-ink', 'surface-sunken', 4.5],
  ['danger', 'danger-soft', 4.5],
  ['accent-text', 'accent-hover', 4.5],
];
for (const c of ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red']) {
  pairs.push([`opt-${c}-fg`, `opt-${c}-bg`, 4.5]);
}

let failures = 0;
let worst = Infinity;
for (const [theme, tokens] of [
  ['light', light],
  ['dark', dark],
]) {
  for (const [fg, bg, min] of pairs) {
    if (!tokens[fg] || !tokens[bg]) {
      console.error(`${theme}: missing token --${tokens[fg] ? bg : fg}`);
      failures++;
      continue;
    }
    const r = ratio(tokens[fg], tokens[bg]);
    worst = Math.min(worst, r / min);
    if (r < min) {
      failures++;
      console.error(`FAIL ${theme} --${fg} on --${bg}: ${r.toFixed(2)}:1 (min ${min})`);
    }
  }
}
console.log(
  `${pairs.length * 2} pairs checked · ${failures} failed · tightest margin ×${worst.toFixed(2)} of threshold`,
);
process.exit(failures ? 1 : 0);
