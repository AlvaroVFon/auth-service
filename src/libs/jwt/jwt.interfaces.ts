import { Roles } from '../../common/enums/roles.enum';

export interface Payload {
  userId: string;
  role: Roles;
  type: TokenType;
  jti?: string;
}

type TokenType = 'access' | 'refresh';
