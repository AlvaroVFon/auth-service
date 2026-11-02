import { randomUUID } from 'node:crypto';

import { MfaService } from '../../../../../src/auth/mfa/mfa.service';
import { generateTotp } from '../../../../../src/auth/mfa/totp';
import { RefreshToken } from '../../../../../src/auth/tokens/refresh-token.interface';
import { RefreshTokenModel } from '../../../../../src/auth/tokens/refresh-token.schema';
import { RefreshTokenService } from '../../../../../src/auth/tokens/refresh-token.service';
import { SessionService } from '../../../../../src/auth/tokens/session.service';
import {
  AccountLockedError,
  InvalidCredentialsError,
} from '../../../../../src/common/exceptions/auth.exceptions';
import {
  InvalidMfaCodeError,
  MfaAlreadyEnabledError,
  MfaEnrollmentRequiredError,
} from '../../../../../src/common/exceptions/mfa.exceptions';
import { CryptoService } from '../../../../../src/libs/crypto';
import { JwtKeyring } from '../../../../../src/libs/jwt';
import { JwtService } from '../../../../../src/libs/jwt/jwt.service';
import type { User as UserInterface } from '../../../../../src/users/users.interface';
import { User } from '../../../../../src/users/users.schema';
import { UsersService } from '../../../../../src/users/users.service';
import fixture from '../../../../fixtures';
import { createRsaKeyPair } from '../../../../helpers/jwt-keyring.helper';

const PASSWORD = 'StrongPassword123!';

describe('MfaService', () => {
  let service: MfaService;
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
    service = new MfaService(users, crypto, sessionService, 'Auth Service');
  });

  const createUser = () =>
    users.create({
      email: `mfa-${randomUUID()}@example.com`,
      password: PASSWORD,
      verified: true,
    });

  const enrollAndActivate = async () => {
    const user = await createUser();
    const enrollment = await service.enroll(user._id.toString(), PASSWORD);
    const activation = await service.activate(
      user._id.toString(),
      generateTotp(enrollment.secret),
    );

    return { user, enrollment, activation };
  };

  test('should enroll idempotently and require the password', async () => {
    const user = await createUser();

    await assert.rejects(
      service.enroll(user._id.toString(), 'WrongPassword123!'),
      InvalidCredentialsError,
    );

    const first = await service.enroll(user._id.toString(), PASSWORD);
    const second = await service.enroll(user._id.toString(), PASSWORD);

    assert.strictEqual(first.secret, second.secret);
    assert.match(first.secret, /^[A-Z2-7]+$/);
    assert.ok(first.otpauthUrl.startsWith('otpauth://totp/'));
  });

  test('should activate with a valid code and return recovery codes', async () => {
    const user = await createUser();
    const enrollment = await service.enroll(user._id.toString(), PASSWORD);

    const activation = await service.activate(
      user._id.toString(),
      generateTotp(enrollment.secret),
    );

    assert.strictEqual(activation.recoveryCodes.length, 10);

    const stored = await users.findById(user._id.toString());
    assert.strictEqual(stored?.mfaEnabled, true);
    assert.strictEqual(stored?.mfaSecret, enrollment.secret);
    assert.strictEqual(stored?.mfaPendingSecret, undefined);
    assert.strictEqual(stored?.mfaRecoveryCodes?.length, 10);
    assert.strictEqual(
      stored?.mfaRecoveryCodes?.includes(activation.recoveryCodes[0]!),
      false,
    );
  });

  test('should refuse activation without enrollment or when enabled', async () => {
    const user = await createUser();

    await assert.rejects(
      service.activate(user._id.toString(), '123456'),
      MfaEnrollmentRequiredError,
    );

    const { user: enabledUser } = await enrollAndActivate();
    await assert.rejects(
      service.enroll(enabledUser._id.toString(), PASSWORD),
      MfaAlreadyEnabledError,
    );
  });

  test('should verify TOTP and recovery codes once', async () => {
    const { user, enrollment, activation } = await enrollAndActivate();

    await service.verify(user._id.toString(), generateTotp(enrollment.secret));

    const recoveryCode = activation.recoveryCodes[0]!;
    await service.verify(user._id.toString(), recoveryCode);

    await assert.rejects(
      service.verify(user._id.toString(), recoveryCode),
      InvalidMfaCodeError,
    );
  });

  test('should lock MFA after repeated invalid codes', async () => {
    const { user, enrollment } = await enrollAndActivate();
    const userId = user._id.toString();

    for (let attempt = 0; attempt < 4; attempt++) {
      await assert.rejects(
        service.verify(userId, '000000'),
        InvalidMfaCodeError,
      );
    }

    await assert.rejects(service.verify(userId, '000000'), AccountLockedError);
    await assert.rejects(
      service.verify(userId, generateTotp(enrollment.secret)),
      AccountLockedError,
    );

    await fixture.updateOne<UserInterface>(
      'User',
      { _id: user._id },
      { mfaLockoutUntil: new Date(Date.now() - 1000) },
    );
    await service.verify(userId, generateTotp(enrollment.secret));
  });

  test('should disable MFA with password and a valid code', async () => {
    const { user, enrollment } = await enrollAndActivate();
    const userId = user._id.toString();

    await assert.rejects(
      service.disable(userId, 'WrongPassword123!', '000000'),
      InvalidCredentialsError,
    );
    await assert.rejects(
      service.disable(userId, PASSWORD, '000000'),
      InvalidMfaCodeError,
    );

    await service.disable(userId, PASSWORD, generateTotp(enrollment.secret));

    const stored = await users.findById(userId);
    assert.strictEqual(stored?.mfaEnabled, false);
    assert.strictEqual(stored?.mfaSecret, undefined);
    assert.strictEqual(stored?.mfaRecoveryCodes?.length ?? 0, 0);
  });

  test('should revoke refresh sessions on activation', async () => {
    const user = await createUser();
    const jti = randomUUID();
    await refreshTokens.create(
      user._id.toString(),
      jti,
      new Date(Date.now() + 60_000),
    );
    const enrollment = await service.enroll(user._id.toString(), PASSWORD);

    await service.activate(
      user._id.toString(),
      generateTotp(enrollment.secret),
    );

    const stored = await fixture.findOne<RefreshToken>('RefreshToken', {
      jti,
    });
    assert.ok(stored?.revokedAt instanceof Date);
  });
});
