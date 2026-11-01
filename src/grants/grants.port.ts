import { Grant, GrantRoles } from './grants.interface';

export interface GrantsPort {
  assignRole(
    userId: string,
    applicationId: string,
    role: GrantRoles,
  ): Promise<Grant>;
  findByUserAndApplication(
    userId: string,
    applicationId: string,
  ): Promise<Grant | null>;
  listByUser(userId: string): Promise<Grant[]>;
}
