import { Roles } from '../../common/enums/roles.enum';
import { TokenTypes } from './token-types.enum';

export interface Payload {
  userId: string;
  role: Roles;
  type: TokenTypes;
  jti?: string;
}

export interface TokenClaims {
  userId?: string;
  role?: Roles;
  type: TokenTypes;
  jti?: string;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  refreshExpiresAt: Date;
}
