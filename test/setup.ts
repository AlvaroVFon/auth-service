process.loadEnvFile('.env.test');
import {
  describe,
  test,
  mock,
  after,
  afterEach,
  before,
  beforeEach,
} from 'node:test';
import assert from 'node:assert';
import {
  connectDB,
  flushDB,
  closeDB,
  dropDB,
} from '../src/config/database.config';
import { getStringEnvVariable } from '../src/config/env.config';
import { registerModels } from './fixtures/model.register';

const baseUri = getStringEnvVariable(
  'MONGO_URI',
  'mongodb://localhost:27017/auth_db_test',
);
const TEST_DB_URI = `${baseUri}_${process.pid}`;

global.describe = describe;
global.test = test;
global.assert = assert;
global.mock = mock;
global.before = before;
global.beforeEach = beforeEach;
global.after = after;
global.afterEach = afterEach;

before(async () => {
  await connectDB(TEST_DB_URI);
  await registerModels();
});

beforeEach(async () => {
  await flushDB();
});

afterEach(async () => {
  await dropDB(`auth_db_test_${process.pid}`);
});

after(async () => {
  await closeDB();
});
