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

export interface LinksPort {
  listInvitations(
    applicationId: string,
    query: InvitationListQuery,
  ): Promise<PaginatedResult<InvitationListItem>>;
  createInvitation(input: CreateInvitationLinkInput): Promise<CreatedLink>;
  createPasswordReset(
    input: CreatePasswordResetLinkInput,
  ): Promise<CreatedLink>;
  consume(token: string, type: LinkType): Promise<OneTimeLink>;
  invalidateActive(filter: InvalidateLinksFilter): Promise<void>;
  release(id: string): Promise<void>;
}
