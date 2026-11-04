import type { Application } from '../applications';
import { Grant, GrantRoles } from './grants.interface';

export interface AssignRoleInput {
  userId: string;
  applicationId: string;
  role: GrantRoles;
  actorId?: string;
}

export interface GrantedApplication {
  application: Application;
  role: GrantRoles;
}

export interface GrantsPort {
  assignRole(input: AssignRoleInput): Promise<Grant>;
  findByUserAndApplication(
    userId: string,
    applicationId: string,
    application?: Application,
  ): Promise<Grant | null>;
  listByUser(userId: string): Promise<Grant[]>;
  listActiveByUser(userId: string): Promise<GrantedApplication[]>;
  listByApplication(applicationId: string): Promise<Grant[]>;
  revokeRole(
    userId: string,
    applicationId: string,
    actorId?: string,
  ): Promise<void>;
  deleteByUser(userId: string, actorId?: string): Promise<void>;
}
