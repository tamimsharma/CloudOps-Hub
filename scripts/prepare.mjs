// Builds the shared workspace packages after `npm install`.
// Guarded so lifecycle scripts in environments without sources (e.g. the
// dependency stage of a Docker build) are a no-op instead of a failure.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const sources = [
  'packages/config/src/index.ts',
  'packages/shared/src/index.ts',
  'packages/types/src/index.ts',
];

if (!sources.every((file) => existsSync(file))) {
  process.exit(0);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const result = spawnSync(npmCommand, ['run', 'build:packages'], { stdio: 'inherit' });

if (result.status !== 0) {
  console.warn(
    '\n[prepare] Could not build shared packages. Run `npm run build:packages` before starting the dev servers.\n'
  );
}

process.exit(0);
