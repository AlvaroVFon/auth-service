import { Roles } from '../common/enums/roles.enum';
import type {
  ListQuery,
  ListQueryOptions,
  PaginatedResult,
} from '../common/pagination';
import { User } from './users.interface';

/** Fields the owner may order the user listing by. */
export const USER_SORTABLE_FIELDS = [
  'email',
  'username',
  'role',
  'verified',
  'createdAt',
] as const;

export type UserSortField = (typeof USER_SORTABLE_FIELDS)[number];

/**
 * Profile projection returned by the management listing: every credential,
 * lockout counter and MFA path is excluded from the type itself, so a consumer
 * can never read a secret the query did not select.
 */
export type UserListItem = Omit<
  User,
  | 'password'
  | 'loginAttempts'
  | 'lockoutUntil'
  | 'mfaSecret'
  | 'mfaPendingSecret'
  | 'mfaRecoveryCodes'
  | 'mfaFailedAttempts'
  | 'mfaLockoutUntil'
  | 'mfaLastUsedStep'
>;

/** Default query contract of `GET /users`. */
export const USER_LIST_OPTIONS: ListQueryOptions<UserSortField> = {
  sortableFields: USER_SORTABLE_FIELDS,
  defaultSort: { field: 'createdAt', direction: -1 },
};

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

/** Lists and revokes the sessions of a user, implemented by the auth domain. */
export interface UserSessionsPort {
  listSessions(userId: string): Promise<UserSessionView[]>;
  /** Returns true when the session existed and was revoked by this call. */
  revokeSession(userId: string, sessionId: string): Promise<boolean>;
  /**
   * Revokes every session and returns the identifiers it actually revoked.
   * `complete` is false when active tokens survived the bounded revocation.
   */
  revokeAllSessions(
    userId: string,
  ): Promise<{ sessionIds: string[]; complete: boolean }>;
}

/** Readable member projection; never includes credentials or MFA secrets. */
export interface UserSummary {
  userId: string;
  email: string;
  username?: string;
  verified: boolean;
  mfaEnabled: boolean;
  createdAt?: Date;
  lastLoginAt?: Date | null;
}

export interface UsersPort {
  findSummariesByIds(ids: string[]): Promise<UserSummary[]>;
  findAll(
    query: ListQuery<UserSortField>,
  ): Promise<PaginatedResult<UserListItem>>;
  verifyCredentials(email: string, password: string): Promise<User>;
  createVerifiedUser(input: CreateVerifiedUserInput): Promise<User>;
  createOwner(email: string, password: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByRole(role: Roles): Promise<User | null>;
  setPassword(id: string, newPassword: string): Promise<void>;
  recordLogin(id: string): Promise<void>;
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
  setSessionManager(manager: UserSessionsPort): void;
}
