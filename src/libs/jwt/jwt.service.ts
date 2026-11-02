import { randomUUID } from 'node:crypto';

import jwt, { JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';

import { assertDependencies } from '../../common/depencencies-validator';
import { InvalidArgumentError } from '../../common/exceptions/base.exception';
import type { LoggerInterface } from '../logger/logger.interface';
import { JwtKeyring } from './jwt-keyring';
import { InvalidTokenError } from './jwt.errors';
import {
  JwtServiceOptions,
  Payload,
  TokenClaims,
  TokenPair,
  TokenRole,
  VerifyTokenOptions,
} from './jwt.interfaces';
import { TokenTypes } from './token-types.enum';

const DEFAULT_ISSUER = 'auth-service';
const RSA_ALGORITHM = 'RS256';
const LEGACY_ALGORITHM = 'HS256';

export class JwtService {
  private readonly issuer: string;
  private readonly legacySecret: string | undefined;
  private readonly logger: LoggerInterface | undefined;
  readonly mfaChallengeExpiresIn: number;

  constructor(
    private readonly keyring: JwtKeyring,
    private readonly expiresIn: number,
    private readonly refreshTokenExpiresIn: number,
    options: JwtServiceOptions = {},
  ) {
    assertDependencies(
      {
        keyring: this.keyring,
        expiresIn: this.expiresIn,
        refreshTokenExpiresIn: this.refreshTokenExpiresIn,
      },
      this.constructor.name,
    );
    this.issuer = options.issuer ?? DEFAULT_ISSUER;
    this.legacySecret = options.legacySecret;
    this.logger = options.logger;
    this.mfaChallengeExpiresIn = options.mfaChallengeExpiresIn ?? 300;
  }

  signTokenPair(userId: string, role: TokenRole, audience?: string): TokenPair {
    const scope = audience ? { aud: audience } : {};
    const refreshTokenId = randomUUID();
    const accessToken = this.signUserToken(
      { userId, role, type: TokenTypes.ACCESS, ...scope },
      this.expiresIn,
    );
    const refreshToken = this.signUserToken(
      { userId, role, type: TokenTypes.REFRESH, jti: refreshTokenId, ...scope },
      this.refreshTokenExpiresIn,
    );

    return {
      accessToken,
      refreshToken,
      refreshTokenId,
      refreshExpiresAt: new Date(
        Date.now() + this.refreshTokenExpiresIn * 1000,
      ),
    };
  }

  signAccessToken(userId: string, role: TokenRole, audience: string): string {
    if (!audience) {
      throw new InvalidArgumentError(
        'InvalidArgumentError: Audience is required for application tokens',
      );
    }

    return this.signUserToken(
      { userId, role, type: TokenTypes.ACCESS, aud: audience },
      this.expiresIn,
    );
  }

  signMfaChallenge(
    userId: string,
    role: TokenRole,
    options: { application?: string; audience?: string } = {},
  ): string {
    return this.signUserToken(
      {
        userId,
        role,
        type: TokenTypes.MFA,
        ...(options.application === undefined
          ? {}
          : { app: options.application }),
        ...(options.audience === undefined ? {} : { aud: options.audience }),
      },
      this.mfaChallengeExpiresIn,
    );
  }

  verifyMfaChallenge(token: string): TokenClaims {
    const claims = this.verifyToken(token);

    if (claims.type !== TokenTypes.MFA || !claims.userId || !claims.jti) {
      throw new InvalidTokenError(
        'InvalidTokenError: Token is not an MFA challenge',
      );
    }

    return claims;
  }

  verifyToken(token: string, options: VerifyTokenOptions = {}): TokenClaims {
    try {
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded || typeof decoded === 'string') {
        throw new Error('Malformed token');
      }

      const payload = decoded.header.kid
        ? this.verifyAsymmetric(token, decoded.header.kid, options)
        : this.verifyLegacy(token, options);

      return this.toTokenClaims(payload);
    } catch (error) {
      // Keep the generic error for callers, but leave the underlying reason
      // (for example an unknown `kid`) visible to operators.
      this.logger?.debug('JWT verification failed', error);
      throw new InvalidTokenError(
        'InvalidTokenError: Token is invalid or has expired',
      );
    }
  }

  private verifyAsymmetric(
    token: string,
    kid: string,
    options: VerifyTokenOptions,
  ): JwtPayload {
    const publicKey = this.keyring.getPublicKey(kid);

    if (!publicKey) {
      throw new Error(`Unknown JWT key id: ${kid}`);
    }

    return jwt.verify(token, publicKey, {
      algorithms: [RSA_ALGORITHM],
      issuer: this.issuer,
      ...(options.audience === undefined ? {} : { audience: options.audience }),
    }) as JwtPayload;
  }

  private verifyLegacy(token: string, options: VerifyTokenOptions): JwtPayload {
    if (!this.legacySecret || options.audience !== undefined) {
      throw new Error('Legacy JWT verification is not available');
    }

    const payload = jwt.verify(token, this.legacySecret, {
      algorithms: [LEGACY_ALGORITHM],
    });

    if (typeof payload === 'string' || payload.aud !== undefined) {
      throw new Error('Legacy tokens must not carry an audience');
    }

    return payload;
  }

  private toTokenClaims(payload: JwtPayload): TokenClaims {
    if (
      typeof payload.type !== 'string' ||
      typeof payload.exp !== 'number' ||
      (typeof payload.sub !== 'undefined' && typeof payload.sub !== 'string') ||
      (typeof payload.userId !== 'undefined' &&
        typeof payload.userId !== 'string') ||
      (typeof payload.aud !== 'undefined' && typeof payload.aud !== 'string')
    ) {
      throw new Error('Invalid token claims');
    }

    return payload as unknown as TokenClaims;
  }

  private signUserToken(payload: Payload, expiresIn: number): string {
    if (!Types.ObjectId.isValid(payload.userId)) {
      throw new InvalidArgumentError(
        'InvalidArgumentError: Payload userId is not a valid ObjectId',
      );
    }

    const { kid, privateKey } = this.keyring.getSigningKey();
    const body: Payload = {
      ...payload,
      sub: payload.sub ?? payload.userId,
      iss: payload.iss ?? this.issuer,
      jti: payload.jti ?? randomUUID(),
    };

    return jwt.sign(body, privateKey, {
      algorithm: RSA_ALGORITHM,
      keyid: kid,
      expiresIn,
    });
  }
}
