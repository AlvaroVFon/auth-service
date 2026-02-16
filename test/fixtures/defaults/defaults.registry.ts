import { DEFAULT_USER } from './users.default';
import { DEFAULT_CODE } from './codes.default';
import { DEFAULT_HOLDER } from './holders.default';

const DefaultModels = {
  USER: 'User',
  CODE: 'Code',
  HOLDER: 'Holder',
};

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultsRegistry: Record<string, any> = {
  [DefaultModels.USER]: DEFAULT_USER,
  [DefaultModels.CODE]: DEFAULT_CODE,
  [DefaultModels.HOLDER]: DEFAULT_HOLDER,
};
