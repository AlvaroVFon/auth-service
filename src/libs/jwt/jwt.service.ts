import jwt, { JwtPayload } from 'jsonwebtoken';
import { Types } from 'mongoose';
import { Payload } from './jwt.interfaces';
import { InvalidArgumentError } from '../../common/exceptions/base.exception';
import { InvalidTokenError } from './jwt.errors';

export class JwtService {
  constructor(
    private readonly secret: string,
    private readonly expiresIn: number,
  ) {}

  generateToken(payload: Payload): string {
    if (!Types.ObjectId.isValid(payload.userId)) {
      throw new InvalidArgumentError(
        'InvalidArgumentError: Payload userId is not a valid ObjectId',
      );
    }
    if (payload.type !== 'access' && payload.type !== 'refresh') {
      throw new InvalidArgumentError('InvalidArgumentError: Payload type is not valid');
    }

    return jwt.sign(payload, this.secret, { expiresIn: this.expiresIn });
  }

  verifyToken(token: string): JwtPayload | string {
    try {
      return jwt.verify(token, this.secret);
    } catch {
      throw new InvalidTokenError('InvalidTokenError: Token is invalid or has expired');
    }
  }

  generateAccessToken(userId: string): string {
    const payload: Payload = { userId, type: 'access' };
    return this.generateToken(payload);
  }
}
