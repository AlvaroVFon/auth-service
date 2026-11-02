import { DEFAULT_APPLICATION } from './applications.default';
import { DEFAULT_BLACKLISTED_TOKEN } from './blacklisted-token.default';
import { DEFAULT_CODE } from './codes.default';
import { DEFAULT_GRANT } from './grants.default';
import { DEFAULT_HOLDER } from './holders.default';
import { DEFAULT_USER } from './users.default';

const DefaultModels = {
  USER: 'User',
  CODE: 'Code',
  HOLDER: 'Holder',
  APPLICATION: 'Application',
  GRANT: 'Grant',
  BLACKLISTED_TOKEN: 'BlacklistedToken',
};

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultsRegistry: Record<string, any> = {
  [DefaultModels.USER]: DEFAULT_USER,
  [DefaultModels.CODE]: DEFAULT_CODE,
  [DefaultModels.HOLDER]: DEFAULT_HOLDER,
  [DefaultModels.APPLICATION]: DEFAULT_APPLICATION,
  [DefaultModels.GRANT]: DEFAULT_GRANT,
  [DefaultModels.BLACKLISTED_TOKEN]: DEFAULT_BLACKLISTED_TOKEN,
};
