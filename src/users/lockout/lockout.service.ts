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

    let counter;
    try {
      counter = await this.lockoutModel.findOneAndUpdate(
        { userId: id, scope },
        {
          $inc: { failedAttempts: 1 },
          $set: { lastFailureAt: now },
          $setOnInsert: { userId: id, scope },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      );
    } catch (error) {
      // Two concurrent first failures can race the unique index; the loser
      // simply increments the document the winner created.
      if ((error as { code?: number }).code !== 11000) {
        throw error;
      }
      counter = await this.lockoutModel.findOneAndUpdate(
        { userId: id, scope },
        { $inc: { failedAttempts: 1 }, $set: { lastFailureAt: now } },
        { returnDocument: 'after' },
      );
    }

    if (!counter) {
      throw new Error('Failed to persist the lockout counter');
    }

    if (counter.failedAttempts >= this.maxAttempts) {
      // Lock conditionally on the counter still being over the threshold and
      // unlocked. A concurrent reset (successful login) or another request's
      // lock must win, so this write never applies a stale decision.
      const locked = await this.lockoutModel.findOneAndUpdate(
        {
          _id: counter._id,
          failedAttempts: { $gte: this.maxAttempts },
          $or: [{ lockoutUntil: null }, { lockoutUntil: { $lte: now } }],
        },
        {
          $set: {
            lockoutUntil: new Date(now.getTime() + this.lockoutDurationMs),
          },
        },
        { returnDocument: 'after' },
      );

      counter =
        locked ?? (await this.lockoutModel.findById(counter._id)) ?? counter;
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
