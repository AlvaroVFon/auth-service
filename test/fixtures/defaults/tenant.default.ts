import { Types } from 'mongoose';

export const DEFAULT_TENANT_ID = new Types.ObjectId();

export const DEFAULT_TENANT = {
  _id: DEFAULT_TENANT_ID,
  name: 'Default Tenant',
  active: true,
  description: 'This is the default tenant for testing purposes',
  secret: 'default-tenant-secret',
};
