import { Types } from 'mongoose';

import {
  ACCOUNT_SCOPE,
  LockoutModel,
  LockoutService,
} from '../../../../src/users/lockout';

const USER_ID = new Types.ObjectId().toString();
const APP_A = new Types.ObjectId().toString();

describe('LockoutService', () => {
  const service = new LockoutService(LockoutModel, 3, 60_000);

  test('AC-1: increments are isolated per scope', async () => {
    await service.incrementFailure(USER_ID, APP_A);

    const app = await service.getStatus(USER_ID, APP_A);
    const global = await service.getStatus(USER_ID, ACCOUNT_SCOPE);

    assert.strictEqual(app.attempts, 1);
    assert.strictEqual(app.remaining, 2);
    assert.strictEqual(global.attempts, 0);
    assert.strictEqual(global.locked, false);
  });

  test('AC-2: locks only the scope that reaches the maximum', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await service.incrementFailure(USER_ID, APP_A);
    }

    const app = await service.getStatus(USER_ID, APP_A);
    const global = await service.getStatus(USER_ID, ACCOUNT_SCOPE);

    assert.strictEqual(app.locked, true);
    if (!app.lockoutUntil) {
      throw new Error('Expected a lockout date');
    }
    assert.ok(app.lockoutUntil.getTime() > Date.now());
    assert.strictEqual(global.locked, false);
  });

  test('AC-3: an expired lockout starts a fresh window', async () => {
    await LockoutModel.create({
      userId: new Types.ObjectId(USER_ID),
      scope: APP_A,
      failedAttempts: 3,
      lockoutUntil: new Date(Date.now() - 60_000),
    });

    const seeded = await LockoutModel.findOne({
      userId: new Types.ObjectId(USER_ID),
      scope: APP_A,
    });
    assert.strictEqual(seeded?.failedAttempts, 3);

    const status = await service.incrementFailure(USER_ID, APP_A);

    assert.strictEqual(status.attempts, 1);
    assert.strictEqual(status.locked, false);
    assert.strictEqual(status.remaining, 2);
  });

  test('AC-4: reset clears only the requested scope', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await service.incrementFailure(USER_ID, APP_A);
    }
    await service.incrementFailure(USER_ID, ACCOUNT_SCOPE);
    await service.incrementFailure(USER_ID, ACCOUNT_SCOPE);

    assert.strictEqual((await service.getStatus(USER_ID, APP_A)).locked, true);

    await service.reset(USER_ID, APP_A);

    const app = await service.getStatus(USER_ID, APP_A);
    assert.strictEqual(app.attempts, 0);
    assert.strictEqual(app.locked, false);
    assert.strictEqual(app.lockoutUntil, null);
    assert.strictEqual(
      (await service.getStatus(USER_ID, ACCOUNT_SCOPE)).attempts,
      2,
    );
  });

  test('does not lock a scope that was reset after its last failure', async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await service.incrementFailure(USER_ID, APP_A);
    }
    await service.reset(USER_ID, APP_A);

    const status = await service.getStatus(USER_ID, APP_A);

    assert.strictEqual(status.attempts, 0);
    assert.strictEqual(status.locked, false);
  });
});
