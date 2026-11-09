import fs from 'node:fs';

import mongoose from 'mongoose';

/**
 * One-off migration for the invitation-history retention change.
 *
 * MongoDB refuses to recreate `expiresAt_1` with a different
 * `expireAfterSeconds`, and Mongoose autoIndex never updates an existing
 * index. Run this once per deployment after the new build is available:
 *
 *   pnpm tsx scripts/migrate-link-ttl.ts --apply
 */
const LINK_TTL_SECONDS = 30 * 24 * 60 * 60;

const run = async () => {
  if (fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const { LinkModel } = await import('../src/links/links.schema');
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(uri);

  const indexes = await LinkModel.collection.indexes();
  const ttl = indexes.find(
    (index) =>
      index.key.expiresAt === 1 && index.expireAfterSeconds !== undefined,
  );

  if (!ttl) {
    console.log('No expiresAt TTL index found; nothing to migrate.');
    return;
  }

  if (ttl.expireAfterSeconds === LINK_TTL_SECONDS) {
    console.log(
      `expiresAt TTL is already ${LINK_TTL_SECONDS}s; nothing to do.`,
    );
    return;
  }

  console.log(
    `expiresAt TTL is ${ttl.expireAfterSeconds}s; expected ${LINK_TTL_SECONDS}s.`,
  );

  if (!process.argv.includes('--apply')) {
    console.log('Dry run. Re-run with --apply to drop and recreate the index.');
    return;
  }

  await LinkModel.collection.dropIndex(ttl.name ?? 'expiresAt_1');
  await LinkModel.syncIndexes();
  console.log(`expiresAt TTL migrated to ${LINK_TTL_SECONDS}s.`);
};

const main = async () => {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

void main();
