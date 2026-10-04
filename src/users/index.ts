import { Holder } from '../holders';
import { User } from './users.interface';

export type { User } from './users.interface';
export { UsersModule } from './users.module';

export interface UsersPort {
  createFromHolder(holder: Holder): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  incrementLoginAttempts(
    id: string,
    maxAttempts: number,
    lockoutDurationMs: number,
  ): Promise<User | null>;
  updateOneById(id: string, updateData: Partial<User>): Promise<User | null>;
}
