import { DEFAULT_BLACKLISTED_TOKEN } from './blacklisted-token.default';
import { DEFAULT_CODE } from './codes.default';
import { DEFAULT_HOLDER } from './holders.default';
import { DEFAULT_TENANT } from './tenant.default';
import { DEFAULT_USER } from './users.default';

const DefaultModels = {
  USER: 'User',
  CODE: 'Code',
  HOLDER: 'Holder',
  TENANT: 'Tenant',
  BLACKLISTED_TOKEN: 'BlacklistedToken',
};

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultsRegistry: Record<string, any> = {
  [DefaultModels.USER]: DEFAULT_USER,
  [DefaultModels.CODE]: DEFAULT_CODE,
  [DefaultModels.HOLDER]: DEFAULT_HOLDER,
  [DefaultModels.TENANT]: DEFAULT_TENANT,
  [DefaultModels.BLACKLISTED_TOKEN]: DEFAULT_BLACKLISTED_TOKEN,
};
