import { randomUUID } from 'node:crypto';

import { RefreshToken } from '../../../../src/auth/tokens/refresh-token.interface';
import { RefreshTokenModel } from '../../../../src/auth/tokens/refresh-token.schema';
import { RefreshTokenService } from '../../../../src/auth/tokens/refresh-token.service';
import { SessionService } from '../../../../src/auth/tokens/session.service';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../../../src/common/exceptions/base.exception';
import { InvalidLinkError } from '../../../../src/common/exceptions/links.exceptions';
import { CryptoService } from '../../../../src/libs/crypto';
import { JwtKeyring } from '../../../../src/libs/jwt';
import { JwtService } from '../../../../src/libs/jwt/jwt.service';
import { LinkModel } from '../../../../src/links/links.schema';
import { LinksService } from '../../../../src/links/links.service';
import { PasswordResetLinksService } from '../../../../src/links/password-reset-links.service';
import { User } from '../../../../src/users/users.schema';
import { UsersService } from '../../../../src/users/users.service';
import fixture from '../../../fixtures';
import { UserFactory } from '../../../helpers/factories/user.factory';
import { createRsaKeyPair } from '../../../helpers/jwt-keyring.helper';
import { silentLogger } from '../../../mocks/logger.mock';

const NEW_PASSWORD = 'NewPassword123!';

describe('PasswordResetLinksService', () => {
  let service: PasswordResetLinksService;
  let links: LinksService;
  let users: UsersService;
  let refreshTokens: RefreshTokenService;

  before(() => {
    const crypto = new CryptoService();
    users = new UsersService(User, crypto);
    refreshTokens = new RefreshTokenService(RefreshTokenModel);
    const jwtService = new JwtService(
      new JwtKeyring([{ ...createRsaKeyPair(), active: true }]),
      3600,
      86400,
      { issuer: 'auth-service-test' },
    );
    const sessionService = new SessionService(jwtService, refreshTokens);
    links = new LinksService(LinkModel, 60_000, 30_000);
    service = new PasswordResetLinksService(
      links,
      users,
      sessionService,
      'https://app.test',
      silentLogger,
    );
  });

  const createUser = () =>
    fixture.create('User', UserFactory.generate({ verified: true }));

  test('should create a reset link for an existing user', async () => {
    const user = await createUser();
    const created = await service.create(user._id.toString());

    assert.match(
      created.link,
      /^https:\/\/app\.test\/reset-password\?token=.+$/,
    );
    assert.strictEqual(created.userId, user._id.toString());
    assert.ok(created.expiresAt.getTime() > Date.now());
  });

  test('should reject unknown or invalid users', async () => {
    await assert.rejects(service.create('bad-id'), InvalidArgumentError);
    await assert.rejects(
      service.create('64b64c4f4f4f4f4f4f4f4f4f'),
      EntityNotFoundError,
    );
  });

  test('should invalidate the previous link when reissued', async () => {
    const user = await createUser();
    const first = await service.create(user._id.toString());
    await service.create(user._id.toString());

    const token = new URL(first.link).searchParams.get('token') as string;

    await assert.rejects(
      service.accept({
        token,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      }),
      InvalidLinkError,
    );
  });

  test('should set the password once and revoke sessions', async () => {
    const user = await createUser();
    const jti = randomUUID();
    await refreshTokens.create(
      user._id.toString(),
      jti,
      new Date(Date.now() + 60_000),
    );
    const created = await service.create(user._id.toString());
    const token = new URL(created.link).searchParams.get('token') as string;

    await service.accept({
      token,
      newPassword: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });

    const authenticated = await users.verifyCredentials(
      user.email,
      NEW_PASSWORD,
    );
    assert.strictEqual(authenticated._id.toString(), user._id.toString());

    const stored = await fixture.findOne<RefreshToken>('RefreshToken', { jti });
    assert.ok(stored?.revokedAt instanceof Date);

    await assert.rejects(
      service.accept({
        token,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      }),
      InvalidLinkError,
    );
  });

  test('should reject an expired link', async () => {
    const user = await createUser();
    const created = await service.create(user._id.toString());
    const token = new URL(created.link).searchParams.get('token') as string;
    await LinkModel.updateOne(
      { userId: user._id },
      { expiresAt: new Date(Date.now() - 1000) },
    );

    await assert.rejects(
      service.accept({
        token,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      }),
      InvalidLinkError,
    );
  });

  test('should reject a link when the user was deleted', async () => {
    const user = await createUser();
    const created = await service.create(user._id.toString());
    const token = new URL(created.link).searchParams.get('token') as string;
    await fixture.deleteOne('User', { _id: user._id });

    await assert.rejects(
      service.accept({
        token,
        newPassword: NEW_PASSWORD,
        passwordConfirmation: NEW_PASSWORD,
      }),
      InvalidLinkError,
    );
  });

  test('should keep the password change when session revocation fails', async () => {
    const user = await createUser();
    const failing = new PasswordResetLinksService(
      links,
      users,
      {
        revokeAll: async () => {
          throw new Error('session store unavailable');
        },
      } as unknown as SessionService,
      'https://app.test',
      silentLogger,
    );
    const created = await failing.create(user._id.toString());
    const token = new URL(created.link).searchParams.get('token') as string;

    await failing.accept({
      token,
      newPassword: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });

    const authenticated = await users.verifyCredentials(
      user.email,
      NEW_PASSWORD,
    );
    assert.strictEqual(authenticated._id.toString(), user._id.toString());
  });

  test('should validate the new password', async () => {
    const user = await createUser();
    const created = await service.create(user._id.toString());
    const token = new URL(created.link).searchParams.get('token') as string;

    await assert.rejects(
      service.accept({
        token,
        newPassword: 'weak',
        passwordConfirmation: 'weak',
      }),
      new InvalidArgumentError(
        'Password does not meet complexity requirements',
      ),
    );
  });
});
