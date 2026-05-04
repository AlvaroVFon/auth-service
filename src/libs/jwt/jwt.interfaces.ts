import { Roles } from '../../common/enums/roles.enum';
import { TokenTypes } from './token-types.enum';

export interface Payload {
  userId: string;
  role: Roles;
  type: TokenTypes;
  jti?: string;
}
