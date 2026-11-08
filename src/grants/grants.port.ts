import type { Application } from '../applications';
import type { Roles } from '../common/enums/roles.enum';
import { Grant, GrantRoles } from './grants.interface';

export interface AssignRoleInput {
  userId: string;
  applicationId: string;
  role: GrantRoles;
  actorId?: string;
}

/**
 * How the caller resolves the application that scopes the grant.
 *
 * `includeArchived` is only set by the owner surface: archived applications keep
 * their grants manageable for the owner, while an app admin keeps resolving
 * with `findAssignableById` and is rejected on an inactive application.
 */
export interface GrantApplicationScope {
  /** Application already resolved by the authorization middleware. */
  application?: Application;
  /** Resolve inactive (archived) applications too; owner surface only. */
  includeArchived?: boolean;
}

export interface GrantedApplication {
  application: Application;
  role: GrantRoles;
}

export interface GrantMemberInput {
  email: string;
  applicationId: string;
  role: GrantRoles;
  /** Global role of the caller: only `owner` may grant the admin role. */
  actorRole: Roles | GrantRoles;
  actorId?: string;
}

export interface GrantedMember {
  email: string;
  role: GrantRoles;
}

export interface GrantsPort {
  assignRole(
    input: AssignRoleInput,
    scope?: GrantApplicationScope,
  ): Promise<Grant>;
  grantMemberByEmail(input: GrantMemberInput): Promise<GrantedMember>;
  findByUserAndApplication(
    userId: string,
    applicationId: string,
    scope?: GrantApplicationScope,
  ): Promise<Grant | null>;
  listByUser(userId: string): Promise<Grant[]>;
  listActiveByUser(userId: string): Promise<GrantedApplication[]>;
  listByApplication(
    applicationId: string,
    scope?: GrantApplicationScope,
  ): Promise<Grant[]>;
  revokeRole(
    userId: string,
    applicationId: string,
    actorId?: string,
  ): Promise<void>;
  deleteByUser(userId: string, actorId?: string): Promise<void>;
}
