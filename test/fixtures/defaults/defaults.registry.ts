import { DEFAULT_USER } from './users.default';

const DefaultModels = {
  USER: 'User',
};

//eslint-disable-next-line @typescript-eslint/no-explicit-any
export const defaultsRegistry: Record<string, any> = {
  [DefaultModels.USER]: DEFAULT_USER,
};
