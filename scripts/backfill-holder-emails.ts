import fs from 'node:fs';

import mongoose, { Types } from 'mongoose';

interface Rename {
  id: Types.ObjectId;
  to: string;
}

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

  const apply = process.argv.includes('--apply');

  await mongoose.connect(uri);

  const seen = new Set<string>();
  const deletions: Types.ObjectId[] = [];
  const renames: Rename[] = [];
  const cursor = HoldersModel.find().sort({ createdAt: -1 }).cursor();

  for await (const holder of cursor) {
    const email = normalizeEmail(holder.email);

    if (seen.has(email)) {
      deletions.push(holder._id);
      console.log(
        `DELETE ${holder._id.toString()} "${holder.email}" (duplicate of "${email}")`,
      );
      continue;
    }

    seen.add(email);

    if (email !== holder.email) {
      renames.push({ id: holder._id, to: email });
      console.log(
        `UPDATE ${holder._id.toString()} "${holder.email}" -> "${email}"`,
      );
    }
  }

  if (!apply) {
    console.log(
      `Dry run: ${renames.length} updates and ${deletions.length} deletions planned. Re-run with --apply to execute.`,
    );
    return;
  }

  // Delete duplicates before renaming survivors: the unique email index would
  // reject a rename while an older document still holds the canonical value.
  if (deletions.length > 0) {
    await HoldersModel.deleteMany({ _id: { $in: deletions } });
  }

  for (const rename of renames) {
    await HoldersModel.updateOne({ _id: rename.id }, { email: rename.to });
  }

  console.log(
    `Holder email backfill finished: ${renames.length} updated, ${deletions.length} duplicates removed`,
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
