process.loadEnvFile('.env.test');
import { describe, test, after, afterEach, before, beforeEach } from 'node:test';
import assert from 'node:assert';
import { connectDB, flushDB, closeDB } from '../src/config/database.config';
import { getStringEnvVariable } from '../src/config/env.config';

const TEST_DB_URI = getStringEnvVariable('TEST_DB_URI', 'mongodb://localhost:27017/testdb');

global.describe = describe;
global.test = test;
global.assert = assert;
global.before = before;
global.beforeEach = beforeEach;
global.after = after;
global.afterEach = afterEach;

console.log = () => {};

before(async () => {
  await connectDB(TEST_DB_URI);
});

afterEach(async () => {
  await flushDB();
});

after(async () => {
  await closeDB();
});
