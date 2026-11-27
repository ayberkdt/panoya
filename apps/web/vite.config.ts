import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

interface VercelHeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

/**
 * `vite preview` serves the production build with the same global response headers Vercel adds
 * (vercel.json is the single source), so CSP problems show up locally before a deploy.
 */
function productionHeaders(): Record<string, string> {
  const config = JSON.parse(
    readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'),
  ) as { headers?: VercelHeaderRule[] };
  const global = config.headers?.find((rule) => rule.source === '/(.*)');
  return Object.fromEntries((global?.headers ?? []).map((h) => [h.key, h.value]));
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: 'localhost' },
  preview: { port: 4173, strictPort: true, host: 'localhost', headers: productionHeaders() },
  build: { target: 'es2022', sourcemap: true },
});
