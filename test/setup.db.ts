import { Database } from '../src/config/database.config';
import { getStringEnvVariable } from '../src/config/env.config';
import { registerModels } from './fixtures/model.register';
import { silentLogger } from './mocks/logger.mock';

const baseUri = getStringEnvVariable(
  'MONGO_URI',
  'mongodb://localhost:27017/auth_db_test',
);
const TEST_DB_URI = `${baseUri}_${process.pid}`;

const database = new Database(TEST_DB_URI, silentLogger);

before(async () => {
  await database.connect();
  await registerModels();
});

beforeEach(async () => {
  await database.flush();
});

after(async () => {
  await database.drop();
  await database.close();
});
