import type { Roles } from '../../common/enums/roles.enum';
import type { GrantRoles } from '../../grants/grants.interface';
import type { LoggerInterface } from '../logger/logger.interface';
import { TokenTypes } from './token-types.enum';

export type TokenRole = Roles | GrantRoles;

export interface Payload {
  userId: string;
  role: TokenRole;
  type: TokenTypes;
  jti?: string;
  sub?: string;
  iss?: string;
  aud?: string;
  app?: string;
}

export interface TokenClaims {
  userId?: string;
  sub?: string;
  role?: TokenRole;
  type: TokenTypes;
  jti?: string;
  iss?: string;
  aud?: string;
  app?: string;
  exp: number;
  iat?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  refreshExpiresAt: Date;
}

export interface JwtServiceOptions {
  issuer?: string;
  mfaChallengeExpiresIn?: number;
  legacySecret?: string;
  logger?: LoggerInterface;
}

export interface VerifyTokenOptions {
  audience?: string;
}
