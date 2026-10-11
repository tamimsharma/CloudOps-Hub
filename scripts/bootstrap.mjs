// Seeds a brand-new database on first container start.
//
// Runs *after* `prisma db push` (see docker/entrypoint.sh) and only seeds when
// the database looks empty, so restarts never wipe data somebody created.
// The seed itself only upserts demo rows and demo role accounts - accounts
// registered through the app survive a re-seed.
import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';

const prisma = new PrismaClient();

async function main() {
  let users = 0;
  let resources = 0;

  try {
    [users, resources] = await Promise.all([prisma.user.count(), prisma.resource.count()]);
  } catch (error) {
    console.error('[bootstrap] Could not inspect the database:', error.message);
    process.exitCode = 1;
    return;
  }

  if (users > 0 && resources > 0) {
    console.log('[bootstrap] Database already populated - skipping seed.');
    return;
  }

  console.log(`[bootstrap] Empty database (users=${users}, resources=${resources}) - seeding...`);
  const result = spawnSync('npm', ['run', 'db:seed', '--workspace=apps/api'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

  if (result.status !== 0) {
    console.error('[bootstrap] Seed failed.');
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
