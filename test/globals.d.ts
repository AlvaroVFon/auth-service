/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, test, after, afterEach, before, beforeEach } from 'node:test';
import assert from 'node:assert';

declare global {
  var describe: typeof describe;
  var test: typeof test;
  var assert: typeof assert;
  var before: typeof before;
  var beforeEach: typeof beforeEach;
  var after: typeof after;
  var afterEach: typeof afterEach;
}
