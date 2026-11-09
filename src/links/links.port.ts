import { GrantRoles } from '../grants';
import { LinkType, OneTimeLink } from './link.interface';

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
