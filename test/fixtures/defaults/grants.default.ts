import { Types } from 'mongoose';

import { Grant, GrantRoles } from '../../../src/grants/grants.interface';
import { DEFAULT_APPLICATION_ID } from './applications.default';
import { DEFAULT_USER_ID } from './users.default';

export const DEFAULT_GRANT: Grant = {
  _id: new Types.ObjectId(),
  userId: DEFAULT_USER_ID,
  applicationId: DEFAULT_APPLICATION_ID,
  role: GrantRoles.VIEWER,
};
