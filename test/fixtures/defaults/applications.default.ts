import { Types } from 'mongoose';

import { Application } from '../../../src/applications/applications.interface';

export const DEFAULT_APPLICATION_ID = new Types.ObjectId();

export const DEFAULT_APPLICATION: Application = {
  _id: DEFAULT_APPLICATION_ID,
  name: 'Default Application',
  slug: 'default-application',
  audience: 'default-application-audience',
  active: true,
};
