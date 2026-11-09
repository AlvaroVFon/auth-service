import { Model, Types } from 'mongoose';

import { assertObjectId } from '../../common/validators/object-id';
import {
  ACCOUNT_SCOPE,
  LockoutScope,
  LockoutStatus,
} from './lockout.interface';
import type { LockoutPort } from './lockout.port';
import type { LockoutCounter } from './lockout.schema';

export class LockoutService implements LockoutPort {
  constructor(
    private readonly lockoutModel: Model<LockoutCounter>,
    private readonly maxAttempts: number,
    private readonly lockoutDurationMs: number,
  ) {}

  async incrementFailure(
    userId: string,
    scope: LockoutScope = ACCOUNT_SCOPE,
  ): Promise<LockoutStatus> {
    assertObjectId(userId, 'userId');
    const id = new Types.ObjectId(userId);
    const now = new Date();

    // An expired lockout starts a fresh window before counting the new failure.
    await this.lockoutModel.updateOne(
      { userId: id, scope, lockoutUntil: { $ne: null, $lte: now } },
      { $set: { failedAttempts: 0, lockoutUntil: null } },
    );

    let counter = await this.lockoutModel.findOneAndUpdate(
      { userId: id, scope },
      {
        $inc: { failedAttempts: 1 },
        $set: { lastFailureAt: now },
        $setOnInsert: { userId: id, scope },
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    if (!counter) {
      throw new Error('Failed to persist the lockout counter');
    }

    if (
      counter.failedAttempts >= this.maxAttempts &&
      (counter.lockoutUntil === null || counter.lockoutUntil <= now)
    ) {
      counter =
        (await this.lockoutModel.findByIdAndUpdate(
          counter._id,
          {
            $set: {
              lockoutUntil: new Date(now.getTime() + this.lockoutDurationMs),
            },
          },
          { returnDocument: 'after' },
        )) ?? counter;
    }

    return this.toStatus(counter);
  }

  async getStatus(
    userId: string,
    scope: LockoutScope = ACCOUNT_SCOPE,
  ): Promise<LockoutStatus> {
    assertObjectId(userId, 'userId');
    const counter = await this.lockoutModel.findOne({
      userId: new Types.ObjectId(userId),
      scope,
    });

    if (!counter) {
      return {
        attempts: 0,
        remaining: this.maxAttempts,
        locked: false,
        lockoutUntil: null,
      };
    }

    return this.toStatus(counter);
  }

  async isLocked(
    userId: string,
    scope: LockoutScope = ACCOUNT_SCOPE,
  ): Promise<boolean> {
    return (await this.getStatus(userId, scope)).locked;
  }

  async reset(
    userId: string,
    scope: LockoutScope = ACCOUNT_SCOPE,
  ): Promise<void> {
    assertObjectId(userId, 'userId');
    await this.lockoutModel.updateOne(
      { userId: new Types.ObjectId(userId), scope },
      { $set: { failedAttempts: 0, lockoutUntil: null } },
    );
  }

  private toStatus(counter: LockoutCounter): LockoutStatus {
    const locked =
      counter.lockoutUntil !== null &&
      counter.lockoutUntil.getTime() > Date.now();
    const expired =
      counter.lockoutUntil !== null &&
      counter.lockoutUntil.getTime() <= Date.now();
    const attempts = expired ? 0 : counter.failedAttempts;

    return {
      attempts,
      remaining: Math.max(this.maxAttempts - attempts, 0),
      locked,
      lockoutUntil: locked ? counter.lockoutUntil : null,
    };
  }
}
