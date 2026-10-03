process.loadEnvFile('.env.test');
import assert from 'node:assert';
import {
  describe,
  test,
  mock,
  after,
  afterEach,
  before,
  beforeEach,
} from 'node:test';

global.describe = describe;
global.test = test;
global.assert = assert;
global.mock = mock;
global.before = before;
global.beforeEach = beforeEach;
global.after = after;
global.afterEach = afterEach;
