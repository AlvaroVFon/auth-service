import { Database } from '../src/config/database.config';
import { getStringEnvVariable } from '../src/config/env.config';
import { registerModels } from './fixtures/model.register';
import { silentLogger } from './mocks/logger.mock';

const baseUri = getStringEnvVariable(
  'MONGO_URI',
  'mongodb://localhost:27017/auth_db_test',
);
const TEST_DB_URI = `${baseUri}_${process.pid}`;

export const testDatabase = new Database(TEST_DB_URI, silentLogger);

before(async () => {
  await testDatabase.connect();
  await registerModels();
});

beforeEach(async () => {
  await testDatabase.flush();
});

after(async () => {
  await testDatabase.drop();
  await testDatabase.close();
});
