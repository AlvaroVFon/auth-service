import type { GrantRoles } from '../grants';

export interface InviteMemberInput {
  email: string;
  applicationId: string;
  role: GrantRoles;
}

/**
 * Invites an email that has no verified account yet. Unlike the public
 * invitation flow, a pre-verification holder is a valid target here.
 */
export interface InvitationsPort {
  inviteMember(input: InviteMemberInput): Promise<void>;
}
