import { Grant, GrantRoles } from './grants.interface';

export interface AssignRoleInput {
  userId: string;
  applicationId: string;
  role: GrantRoles;
}

export interface GrantsPort {
  assignRole(input: AssignRoleInput): Promise<Grant>;
  findByUserAndApplication(
    userId: string,
    applicationId: string,
  ): Promise<Grant | null>;
  listByUser(userId: string): Promise<Grant[]>;
  listByApplication(applicationId: string): Promise<Grant[]>;
  revokeRole(userId: string, applicationId: string): Promise<void>;
  deleteByUser(userId: string): Promise<void>;
}
