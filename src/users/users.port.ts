import { Roles } from '../common/enums/roles.enum';
import { User } from './users.interface';

export interface CreateVerifiedUserInput {
  email: string;
  passwordHash: string;
}

export interface UserGrantsCleanerPort {
  deleteByUser(userId: string): Promise<void>;
}

export interface UsersPort {
  verifyCredentials(email: string, password: string): Promise<User>;
  createVerifiedUser(input: CreateVerifiedUserInput): Promise<User>;
  createOwner(email: string, password: string): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  findByRole(role: Roles): Promise<User | null>;
  setPassword(id: string, newPassword: string): Promise<void>;
  deleteOneById(id: string): Promise<User | null>;
  setGrantsCleaner(cleaner: UserGrantsCleanerPort): void;
}
