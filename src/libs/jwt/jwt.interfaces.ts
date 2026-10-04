import { Roles } from '../../common/enums/roles.enum';
import { TokenTypes } from './token-types.enum';

export interface TenantPayload {
  tenantId: string;
  type: TokenTypes;
}
export interface Payload {
  userId: string;
  role: Roles;
  type: TokenTypes;
  jti?: string;
  tenantId?: string;
}

export interface TokenClaims {
  userId?: string;
  role?: Roles;
  tenantId?: string;
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
