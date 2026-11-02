import fs from 'node:fs';

const run = async () => {
  if (fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  const { composition } = await import('../src/config/bootstrap');
  const { resolveOwnerCredentials } =
    await import('../src/config/owner.config');
  const { provisionOwnerFromEnv } =
    await import('../src/config/owner-provisioning');

  const credentials = resolveOwnerCredentials();

  if (!credentials) {
    throw new Error('OWNER_EMAIL and OWNER_PASSWORD are required');
  }

  await composition.database.connect();

  try {
    const result = await provisionOwnerFromEnv({
      credentials,
      ownerBootstrap: composition.ownerBootstrap,
      logger: composition.logger,
    });

    console.log(`Owner bootstrap: ${result.status} (${result.email})`);
  } finally {
    await composition.database.close();
  }
};

const main = async () => {
  try {
    await run();
  } catch (error) {
    console.error('Owner bootstrap failed', error);
    process.exitCode = 1;
  }
};

void main();
