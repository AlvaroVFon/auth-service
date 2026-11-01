import { Types } from 'mongoose';

export enum GrantRoles {
  VIEWER = 'viewer',
  EDITOR = 'editor',
  ADMIN = 'admin',
}

export interface Grant {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  applicationId: Types.ObjectId;
  role: GrantRoles;
}
