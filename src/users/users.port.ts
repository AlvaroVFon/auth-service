import { User } from './users.interface';

export interface CreateVerifiedUserInput {
  email: string;
  passwordHash: string;
}

export interface UsersPort {
  verifyCredentials(email: string, password: string): Promise<User>;
  createVerifiedUser(input: CreateVerifiedUserInput): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  setPassword(id: string, newPassword: string): Promise<void>;
}
