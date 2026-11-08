import type { Application } from '../applications';
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
}

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

export interface GrantsPort {
  assignRole(
    input: AssignRoleInput,
    scope?: GrantApplicationScope,
  ): Promise<Grant>;
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
  ): Promise<void>;
  deleteByUser(userId: string, actorId?: string): Promise<void>;
}
