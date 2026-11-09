import { Types } from 'mongoose';

import { Roles } from '../common/enums/roles.enum';

/** Aggregate security state returned to the owner. Never contains secrets. */
export interface UserSecurityOverview {
  verified: boolean;
  mfaEnabled: boolean;
  loginAttempts: number;
  lockoutUntil: Date | null;
  mfaLockoutUntil: Date | null;
  lastLoginAt: Date | null;
  activeSessions: number;
}

export interface User {
  _id: Types.ObjectId;
  username?: string;
  email: string;
  password: string;
  role: Roles;
  verified: boolean;
  lastLoginAt?: Date | null;
  loginAttempts?: number;
  lockoutUntil?: Date | null;
  telegramChatId?: string;
  mfaEnabled?: boolean;
  mfaSecret?: string;
  mfaPendingSecret?: string;
  mfaRecoveryCodes?: string[];
  mfaFailedAttempts?: number;
  mfaLockoutUntil?: Date | null;
  mfaLastUsedStep?: number;
  createdAt?: Date;
  updatedAt?: Date;
}
