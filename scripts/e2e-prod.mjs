// Runs the whole E2E suite against the production build served by `vite preview`, which sends the
// same global headers as Vercel (CSP included, read from vercel.json). Extra arguments are passed
// to Playwright, e.g. `corepack pnpm e2e:prod tests/e2e/csp.spec.ts`.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url));
const result = spawnSync(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, PW_TARGET: 'prod' },
});
process.exit(result.status ?? 1);
