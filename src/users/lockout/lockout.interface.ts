export const ACCOUNT_SCOPE = 'global';

export type LockoutScope = string;

export interface LockoutStatus {
  attempts: number;
  remaining: number;
  locked: boolean;
  lockoutUntil: Date | null;
}
