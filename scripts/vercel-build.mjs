// Vercel build that works whatever the project's Root Directory is (repo root or apps/web).
// Both package.json files expose it as `npm run vercel-build`; npm runs it from the Root
// Directory, so the output lands in `<Root Directory>/dist`, which vercel.json serves.
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const outDir = resolve(process.cwd(), 'dist');

function run(args) {
  console.log(`> node ${args.join(' ')}`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: repo });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`repo root: ${repo}`);
console.log(`output:    ${outDir}`);
run([resolve(repo, 'scripts/check-contrast.mjs')]);
run([
  resolve(repo, 'apps/web/node_modules/vite/bin/vite.js'),
  'build',
  resolve(repo, 'apps/web'),
  '--outDir',
  outDir,
  '--emptyOutDir',
]);
