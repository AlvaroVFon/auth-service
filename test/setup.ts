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
import { Database } from '../src/config/database.config';
import { getStringEnvVariable } from '../src/config/env.config';
import { registerModels } from './fixtures/model.register';
import { LoggerInterface } from '../src/common/interceptors/httplogger.interceptor';

const baseUri = getStringEnvVariable(
  'MONGO_URI',
  'mongodb://localhost:27017/auth_db_test',
);
const TEST_DB_URI = `${baseUri}_${process.pid}`;

const logger: LoggerInterface = {
  log: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};

const database = new Database(TEST_DB_URI, logger);

global.describe = describe;
global.test = test;
global.assert = assert;
global.mock = mock;
global.before = before;
global.beforeEach = beforeEach;
global.after = after;
global.afterEach = afterEach;

before(async () => {
  await database.connect();
  await registerModels();
});

beforeEach(async () => {
  await database.flush();
});

afterEach(async () => {
  await database.drop(`auth_db_test_${process.pid}`);
});

after(async () => {
  await database.close();
});
