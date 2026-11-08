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

export interface UsersPort {
  findAll(query: ListQuery<UserSortField>): Promise<PaginatedResult<User>>;
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
  setGrantsCleaner(cleaner: UserGrantsCleanerPort): void;
  setSessionRevoker(revoker: UserSessionRevokerPort): void;
}
