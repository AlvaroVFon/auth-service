import { Roles } from '../common/enums/roles.enum';
import { User } from './users.interface';

export interface CreateVerifiedUserInput {
  email: string;
  passwordHash: string;
}

export interface UserGrantsCleanerPort {
  deleteByUser(userId: string, actorId?: string): Promise<void>;
}

/** Revokes every refresh token of a user, used after credential changes. */
export interface UserSessionRevokerPort {
  revokeAll(userId: string): Promise<void>;
}

/** Active session as exposed by the owner support surface. */
export interface UserSessionView {
  id: string;
  device: string | null;
  application: string | null;
  ipAddress: string | null;
  createdAt: Date | null;
  lastActivityAt: Date;
  expiresAt: Date;
}

/** Lists the active sessions of a user, implemented by the auth domain. */
export interface UserSessionsPort {
  listSessions(userId: string): Promise<UserSessionView[]>;
}

export interface UsersPort {
  verifyCredentials(email: string, password: string): Promise<User>;
  createVerifiedUser(input: CreateVerifiedUserInput): Promise<User>;
  createOwner(email: string, password: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByRole(role: Roles): Promise<User | null>;
  setPassword(id: string, newPassword: string): Promise<void>;
  deleteOneById(id: string, actorId?: string): Promise<User | null>;
  setMfaPendingSecret(id: string, secret: string): Promise<void>;
  activateMfa(
    id: string,
    secret: string,
    recoveryCodeHashes: string[],
  ): Promise<boolean>;
  disableMfa(id: string): Promise<void>;
  recordFailedMfa(id: string): Promise<boolean>;
  recordMfaStep(id: string, step: number): Promise<boolean>;
  resetMfaFailures(id: string): Promise<void>;
  consumeMfaRecoveryCode(id: string, codeHash: string): Promise<boolean>;
  listSessions(userId: string): Promise<UserSessionView[]>;
  setGrantsCleaner(cleaner: UserGrantsCleanerPort): void;
  setSessionRevoker(revoker: UserSessionRevokerPort): void;
  setSessionLister(lister: UserSessionsPort): void;
}
