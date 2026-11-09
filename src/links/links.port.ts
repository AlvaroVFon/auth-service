import { GrantRoles } from '../grants';
import { LinkType, OneTimeLink } from './link.interface';

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
  /**
   * Reissues a pending invitation: the previous link is invalidated by the
   * creation flow and a new one is returned. A used invitation raises
   * `ConflictError`; an unknown one raises `EntityNotFoundError`.
   */
  resendInvitation(
    applicationId: string,
    invitationId: string,
    allowAdminInvitation?: boolean,
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
