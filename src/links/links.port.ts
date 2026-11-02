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
  createInvitation(input: CreateInvitationLinkInput): Promise<CreatedLink>;
  createPasswordReset(
    input: CreatePasswordResetLinkInput,
  ): Promise<CreatedLink>;
  consume(token: string, type: LinkType): Promise<OneTimeLink>;
  invalidateActive(filter: InvalidateLinksFilter): Promise<void>;
  release(id: string): Promise<void>;
}
