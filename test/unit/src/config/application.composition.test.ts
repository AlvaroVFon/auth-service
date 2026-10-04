import { Roles } from '../../../../src/common/enums/roles.enum';
import { createApplicationComposition } from '../../../../src/config/application.composition';
import { JwtService } from '../../../../src/libs/jwt/jwt.service';

describe('application composition configuration', () => {
  test('uses JWT_EXPIRATION for access tokens', () => {
    const originalExpiration = process.env.JWT_EXPIRATION;
    const originalLegacyExpiration = process.env.JWT_EXPIRES_IN;

    process.env.JWT_EXPIRATION = '123';
    delete process.env.JWT_EXPIRES_IN;

    try {
      const composition = createApplicationComposition();
      const authService = composition.authModule.service as unknown as {
        sessionService: { jwtService: JwtService };
      };
      const token = authService.sessionService.jwtService.generateAccessToken(
        '507f1f77bcf86cd799439011',
        Roles.USER,
      );
      const claims = authService.sessionService.jwtService.verifyToken(token);

      assert.ok(claims.exp - Math.floor(Date.now() / 1000) >= 122);
    } finally {
      if (originalExpiration === undefined) {
        delete process.env.JWT_EXPIRATION;
      } else {
        process.env.JWT_EXPIRATION = originalExpiration;
      }
      if (originalLegacyExpiration === undefined) {
        delete process.env.JWT_EXPIRES_IN;
      } else {
        process.env.JWT_EXPIRES_IN = originalLegacyExpiration;
      }
    }
  });
});
