import jwt, { JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';
import { Payload } from './jwt.interfaces';
import { InvalidArgumentError } from '../../common/exceptions/base.exception';
import { InvalidTokenError } from './jwt.errors';
import { randomUUID } from 'node:crypto';
import { Roles } from '../../common/enums/roles.enum';
import { TokenTypes } from './token-types.enum';
import { assertDependencies } from '../../common/depencencies-validator';

export class JwtService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: number,
    private readonly refreshExpiresIn: number,
  ) {
    assertDependencies(
      {
        secret: this.secret,
        expiresIn: this.expiresIn,
        refreshExpiresIn: this.refreshExpiresIn,
      },
      this.constructor.name,
    );
  }

  generateToken(payload: Payload, expiresIn: number): string {
    if (!Types.ObjectId.isValid(payload.userId)) {
      throw new InvalidArgumentError(
        'InvalidArgumentError: Payload userId is not a valid ObjectId',
      );
    }
    if (
      payload.type !== TokenTypes.ACCESS &&
      payload.type !== TokenTypes.REFRESH
    ) {
      throw new InvalidArgumentError(
        'InvalidArgumentError: Payload type is not valid',
      );
    }

    const jti = randomUUID();
    payload.jti = jti;

    return jwt.sign(payload, this.secret, { expiresIn });
  }

  verifyToken(token: string): JwtPayload | string {
    try {
      return jwt.verify(token, this.secret);
    } catch {
      throw new InvalidTokenError(
        'InvalidTokenError: Token is invalid or has expired',
      );
    }
  }

  generateAccessToken(userId: string, role: Roles): string {
    const payload: Payload = { userId, role, type: TokenTypes.ACCESS };
    return this.generateToken(payload, this.expiresIn);
  }

  generateRefreshToken(userId: string, role: Roles): string {
    const payload: Payload = { userId, role, type: TokenTypes.REFRESH };
    return this.generateToken(payload, this.refreshExpiresIn);
  }
}
