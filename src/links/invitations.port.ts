import type { Application } from '../applications';
import type { Roles } from '../common/enums/roles.enum';
import type { GrantRoles } from '../grants';

export interface InviteMemberInput {
  email: string;
  applicationId: string;
  role: GrantRoles;
  /** Application already resolved by the caller, to avoid a second lookup. */
  application?: Application;
  /** Global role of the caller; only the owner may invite an admin. */
  actorRole?: Roles;
}

/** Delivers the invitation link to an email that has no account yet. */
export interface InvitationMailerPort {
  sendInvitationEmail(to: string, link: string): Promise<void>;
}

/**
 * Invites an email that has no user account. Unlike the public invitation
 * flow, a pre-verification holder is a valid target here.
 */
export interface InvitationsPort {
  inviteMember(input: InviteMemberInput): Promise<void>;
}
