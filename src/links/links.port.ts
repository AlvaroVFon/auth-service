import type {
  ListQuery,
  ListQueryOptions,
  PaginatedResult,
} from '../common/pagination';
import { GrantRoles } from '../grants';
import { LinkType, OneTimeLink } from './link.interface';

/** Computed state of an invitation, in precedence order. */
export const INVITATION_STATES = [
  'used',
  'invalidated',
  'expired',
  'pending',
] as const;

export type InvitationState = (typeof INVITATION_STATES)[number];

export const INVITATION_SORTABLE_FIELDS = ['createdAt'] as const;

export type InvitationSortField = (typeof INVITATION_SORTABLE_FIELDS)[number];

export const INVITATION_LIST_OPTIONS: ListQueryOptions<InvitationSortField> = {
  sortableFields: INVITATION_SORTABLE_FIELDS,
  defaultSort: { field: 'createdAt', direction: -1 },
};

/** Invitation fields exposed by the management listing. */
export interface InvitationListItem {
  id: string;
  email?: string;
  role?: GrantRoles;
  state: InvitationState;
  expiresAt: Date;
  usedAt: Date | null;
  invalidatedAt: Date | null;
  createdAt?: Date;
}

export interface InvitationListQuery extends ListQuery<InvitationSortField> {
  state?: InvitationState;
}

export interface CreateInvitationLinkInput {
  email: string;
  applicationId: string;
  role: GrantRoles;
  telegramChatId?: string;
  /** Effective invitation TTL; falls back to the service default. */
  expiresInMs?: number;
}

export interface CreatePasswordResetLinkInput {
  userId: string;
}

export interface CreatedLink {
  link: OneTimeLink;
  token: string;
}

export interface InvalidateLinksFilter {
  type: LinkType;
  email?: string;
  applicationId?: string;
  userId?: string;
}

/**
 * Unused invitation links split by whether their expiry has passed. `pending`
 * excludes used and non-expired invalidated links; `expired` includes unused
 * expired links even when they were invalidated, and is a rolling 30-day count
 * because links are retained after expiry. `pending + expired` is therefore
 * not the all-time invitation total.
 */
export interface InvitationCounts {
  pending: number;
  expired: number;
}

export interface LinksPort {
  countInvitations(): Promise<InvitationCounts>;
  listInvitations(
    applicationId: string,
    query: InvitationListQuery,
  ): Promise<PaginatedResult<InvitationListItem>>;
  /**
   * Reissues a pending invitation: the previous link is invalidated by the
   * creation flow and a new one is returned. A used invitation raises
   * `ConflictError`; an unknown one raises `EntityNotFoundError`.
   */
  resendInvitation(
    applicationId: string,
    invitationId: string,
    allowAdminInvitation?: boolean,
    expiresInMs?: number,
  ): Promise<CreatedLink>;
  /**
   * Revokes one invitation of an application. Returns false when it was
   * already invalidated (idempotent no-op), throws `EntityNotFoundError` when
   * it does not belong to the application and `ConflictError` when used.
   */
  revokeInvitation(
    applicationId: string,
    invitationId: string,
  ): Promise<boolean>;
  createInvitation(input: CreateInvitationLinkInput): Promise<CreatedLink>;
  createPasswordReset(
    input: CreatePasswordResetLinkInput,
  ): Promise<CreatedLink>;
  consume(token: string, type: LinkType): Promise<OneTimeLink>;
  invalidateActive(filter: InvalidateLinksFilter): Promise<void>;
  release(id: string): Promise<void>;
}
