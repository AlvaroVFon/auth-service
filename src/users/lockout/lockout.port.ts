import { LockoutScope, LockoutStatus } from './lockout.interface';

export interface LockoutPort {
  incrementFailure(
    userId: string,
    scope?: LockoutScope,
  ): Promise<LockoutStatus>;
  getStatus(userId: string, scope?: LockoutScope): Promise<LockoutStatus>;
  isLocked(userId: string, scope?: LockoutScope): Promise<boolean>;
  reset(userId: string, scope?: LockoutScope): Promise<void>;
}
