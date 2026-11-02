import { Types } from 'mongoose';

import { GrantRoles } from '../grants';

export enum LinkType {
  INVITATION = 'invitation',
  PASSWORD_RESET = 'password_reset',
}

export interface OneTimeLink {
  _id: Types.ObjectId;
  tokenHash: string;
  type: LinkType;
  email?: string;
  applicationId?: Types.ObjectId;
  role?: GrantRoles;
  userId?: Types.ObjectId;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt?: Date;
}
