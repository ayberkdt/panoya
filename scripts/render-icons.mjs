// Renders the PNG app icons from the logo geometry (same paths as public/favicon.svg and
// apps/web/src/components/Logo.tsx). Run after changing the mark: `node scripts/render-icons.mjs`.
// Uses the installed Edge through Playwright, so no image library is needed.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const TILE = '#0b6a5a';
const PAPER = '#fbfaf6';
const FOLD = '#f5c04a';
const LETTER =
  'M12 6.5h7.25l4.25 4.25v5.75a2.5 2.5 0 0 1-2.5 2.5h-6.5v3.5a2.5 2.5 0 0 1-5 0V9A2.5 2.5 0 0 1 12 6.5Zm4.5 4.75a1.5 1.5 0 0 0 0 3h2a1.5 1.5 0 0 0 0-3Z';
const CORNER = 'M19.25 6.5l4.25 4.25h-3.25a1 1 0 0 1-1-1Z';

/** rounded: keep the tile corners; scale: letter size inside the square (maskable safe zone). */
function svg({ rounded, scale }) {
  const offset = 16 - 16 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="${rounded ? 8 : 0}" fill="${TILE}"/>
    <g transform="translate(${offset} ${offset}) scale(${scale})">
      <path fill="${PAPER}" fill-rule="evenodd" d="${LETTER}"/>
      <path fill="${FOLD}" d="${CORNER}"/>
    </g></svg>`;
}

const outputs = [
  // iOS rounds the corners itself and ignores transparency.
  { file: 'apple-touch-icon.png', size: 180, rounded: false, scale: 0.9 },
  { file: 'icon-192.png', size: 192, rounded: true, scale: 1 },
  { file: 'icon-512.png', size: 512, rounded: true, scale: 1 },
  // Maskable: the platform crops to a circle/squircle; keep the letter inside the 80% safe zone.
  { file: 'icon-maskable-512.png', size: 512, rounded: false, scale: 0.72 },
];

const dir = fileURLToPath(new URL('../apps/web/public/', import.meta.url));
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const page = await browser.newPage();
for (const o of outputs) {
  await page.setViewportSize({ width: o.size, height: o.size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${o.size}px;height:${o.size}px}</style>${svg(o)}`,
  );
  await page.screenshot({ path: dir + o.file, omitBackground: true });
  console.log(`${o.file} ${o.size}×${o.size}`);
}
await browser.close();
