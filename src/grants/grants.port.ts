import type { Application } from '../applications';
import type { Roles } from '../common/enums/roles.enum';
import type {
  ListQuery,
  ListQueryOptions,
  PaginatedResult,
} from '../common/pagination';
import type { UserSummary } from '../users';
import { Grant, GrantRoles } from './grants.interface';

/** Fields the member listing may be ordered by. */
export const GRANT_MEMBER_SORTABLE_FIELDS = ['createdAt', 'role'] as const;

export type GrantMemberSortField =
  (typeof GRANT_MEMBER_SORTABLE_FIELDS)[number];

export const GRANT_MEMBER_LIST_OPTIONS: ListQueryOptions<GrantMemberSortField> =
  {
    sortableFields: GRANT_MEMBER_SORTABLE_FIELDS,
    defaultSort: { field: 'createdAt', direction: -1 },
  };

export interface GrantMember extends UserSummary {
  role: GrantRoles;
  /** Membership timestamp (the grant document), not the account date. */
  createdAt?: Date;
}

export interface AssignRoleInput {
  userId: string;
  applicationId: string;
  role: GrantRoles;
  /** Global role of the caller, when the request comes from the HTTP surface. */
  actorRole?: Roles;
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
  actorRole?: Roles;
  actorId?: string;
}

export interface GrantedMember {
  email: string;
  role: GrantRoles;
}

export interface MemberMutationInput {
  userId: string;
  applicationId: string;
  actorRole?: Roles;
  actorId?: string;
}

export interface GrantsPort {
  assignRole(
    input: AssignRoleInput,
    scope?: GrantApplicationScope,
  ): Promise<Grant>;
  grantMemberByEmail(input: GrantMemberInput): Promise<GrantedMember>;
  changeMemberRole(
    input: MemberMutationInput & { role: GrantRoles },
  ): Promise<Grant>;
  removeMember(input: MemberMutationInput): Promise<void>;
  /**
   * Creates the grant only when the pair has none; returns false when it
   * already existed. Never overwrites an existing role (for example an admin
   * promoted after an invitation was issued).
   */
  assignRoleIfAbsent(input: AssignRoleInput): Promise<boolean>;
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
  listMembers(
    applicationId: string,
    query: ListQuery<GrantMemberSortField>,
    scope?: GrantApplicationScope,
  ): Promise<PaginatedResult<GrantMember>>;
  revokeRole(
    userId: string,
    applicationId: string,
    actorId?: string,
    actorRole?: Roles,
  ): Promise<void>;
  deleteByUser(userId: string, actorId?: string): Promise<void>;
}
