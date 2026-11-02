import fs from 'node:fs';

import mongoose from 'mongoose';

const run = async () => {
  if (fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const { normalizeEmail } = await import('../src/common/email');
  const { HoldersModel } = await import('../src/holders/holders.schema');

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(uri);

  const seen = new Set<string>();
  let updated = 0;
  let removed = 0;
  const holders = await HoldersModel.find().sort({ createdAt: -1 }).exec();

  for (const holder of holders) {
    const email = normalizeEmail(holder.email);

    if (seen.has(email)) {
      await holder.deleteOne();
      removed += 1;
      continue;
    }

    seen.add(email);

    if (email !== holder.email) {
      holder.email = email;
      await holder.save();
      updated += 1;
    }
  }

  console.log(
    `Holder email backfill finished: ${updated} updated, ${removed} duplicates removed`,
  );
};

const main = async () => {
  try {
    await run();
  } catch (error) {
    console.error('Holder email backfill failed', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

void main();
