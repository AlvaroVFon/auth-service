import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import { assertDependencies } from '../../common/depencencies-validator';
import { Roles } from '../../common/enums/roles.enum';
import { InvalidArgumentError } from '../../common/exceptions/base.exception';
import { InvalidTokenError } from './jwt.errors';
import {
  Payload,
  TenantPayload,
  TokenClaims,
  TokenPair,
} from './jwt.interfaces';
import { TokenTypes } from './token-types.enum';

export class JwtService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: number,
    private readonly refreshTokenExpiresIn: number,
    private readonly tenantTokenExpiresIn: number = expiresIn,
  ) {
    assertDependencies(
      {
        secret: this.secret,
        expiresIn: this.expiresIn,
        refreshTokenExpiresIn: this.refreshTokenExpiresIn,
      },
      this.constructor.name,
    );
  }

  issueSession(userId: string, role: Roles): TokenPair {
    const refreshTokenId = randomUUID();
    const accessToken = this.signUserToken(
      { userId, role, type: TokenTypes.ACCESS },
      this.expiresIn,
    );
    const refreshToken = this.signUserToken(
      { userId, role, type: TokenTypes.REFRESH, jti: refreshTokenId },
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

  verifyToken(token: string): TokenClaims {
    try {
      const payload = jwt.verify(token, this.secret);

      if (
        typeof payload === 'string' ||
        typeof payload.type !== 'string' ||
        typeof payload.exp !== 'number'
      ) {
        throw new Error('Invalid token claims');
      }

      return payload as unknown as TokenClaims;
    } catch {
      throw new InvalidTokenError(
        'InvalidTokenError: Token is invalid or has expired',
      );
    }
  }

  generateTenantToken(tenantId: string): string {
    if (!Types.ObjectId.isValid(tenantId)) {
      throw new InvalidArgumentError('Invalid tenant ID');
    }
    const payload: TenantPayload = { tenantId, type: TokenTypes.ACCESS };

    return jwt.sign(payload, this.secret, {
      expiresIn: this.tenantTokenExpiresIn,
    });
  }

  private signUserToken(payload: Payload, expiresIn: number): string {
    if (!Types.ObjectId.isValid(payload.userId)) {
      throw new InvalidArgumentError(
        'InvalidArgumentError: Payload userId is not a valid ObjectId',
      );
    }

    payload.jti ??= randomUUID();

    return jwt.sign(payload, this.secret, { expiresIn });
  }
}
