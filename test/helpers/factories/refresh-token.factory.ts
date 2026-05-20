import { MotherFactory } from './mother.factory';
import { RefreshToken } from '../../../src/auth/tokens/refresh-token.interface';
import { TokenTypes } from '../../../src/libs/jwt/token-types.enum';

export class RefreshTokenFactory {
  static generate(overrides?: Partial<RefreshToken>): RefreshToken {
    return {
      _id: MotherFactory.objectId(),
      type: TokenTypes.REFRESH,
      expiresAt: MotherFactory.date(),
      revokedAt: null,
      replacedByJti: null,
      jti: MotherFactory.uuid(),
      userId: MotherFactory.objectId(),
      ...overrides,
    };
  }
}
