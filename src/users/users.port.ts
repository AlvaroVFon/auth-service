import { Roles } from '../common/enums/roles.enum';
import { User } from './users.interface';

export interface CreateVerifiedUserInput {
  email: string;
  passwordHash: string;
}

export interface UserGrantsCleanerPort {
  deleteByUser(userId: string, actorId?: string): Promise<void>;
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
  verifyPassword(id: string, password: string): Promise<boolean>;
  setMfaPendingSecret(id: string, secret: string): Promise<void>;
  activateMfa(
    id: string,
    secret: string,
    recoveryCodeHashes: string[],
  ): Promise<boolean>;
  disableMfa(id: string): Promise<void>;
  recordFailedMfa(id: string): Promise<boolean>;
  resetMfaFailures(id: string): Promise<void>;
  consumeMfaRecoveryCode(id: string, codeHash: string): Promise<boolean>;
  setGrantsCleaner(cleaner: UserGrantsCleanerPort): void;
}
