import { Holder } from './holders.interface';

export interface HoldersPort {
  create(email: string, password: string): Promise<Holder>;
  findByEmail(email: string): Promise<Holder | null>;
  findById(id: string): Promise<Holder | null>;
  deleteById(id: string): Promise<void>;
}
