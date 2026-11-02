import {
  AccountLockedError,
  InvalidCredentialsError,
} from '../../common/exceptions/auth.exceptions';
import { EntityNotFoundError } from '../../common/exceptions/base.exception';
import {
  InvalidMfaCodeError,
  MfaAlreadyEnabledError,
  MfaEnrollmentRequiredError,
  MfaNotEnabledError,
} from '../../common/exceptions/mfa.exceptions';
import { CryptoService } from '../../libs/crypto';
import type { User, UsersPort } from '../../users';
import type { SessionService } from '../tokens/session.service';
import { MfaActivation, MfaEnrollment } from './mfa.interface';
import { buildOtpauthUrl } from './otpauth';
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-codes';
import { generateTotpSecret, verifyTotp } from './totp';

export class MfaService {
  constructor(
    private readonly usersService: UsersPort,
    private readonly cryptoService: CryptoService,
    private readonly sessionService: SessionService,
    private readonly issuer: string,
  ) {}

  async enroll(userId: string, password: string): Promise<MfaEnrollment> {
    const user = await this.getUser(userId);

    if (user.mfaEnabled) {
      throw new MfaAlreadyEnabledError();
    }

    const validPassword = await this.cryptoService.compareString(
      password,
      user.password,
    );

    if (!validPassword) {
      throw new InvalidCredentialsError('Invalid password');
    }

    const secret = user.mfaPendingSecret ?? generateTotpSecret();
    await this.usersService.setMfaPendingSecret(userId, secret);

    return {
      secret,
      otpauthUrl: buildOtpauthUrl({
        issuer: this.issuer,
        account: user.email,
        secret,
      }),
    };
  }

  async activate(userId: string, code: string): Promise<MfaActivation> {
    const user = await this.getUser(userId);

    if (user.mfaEnabled) {
      throw new MfaAlreadyEnabledError();
    }
    if (!user.mfaPendingSecret) {
      throw new MfaEnrollmentRequiredError();
    }
    if (!verifyTotp(user.mfaPendingSecret, code)) {
      throw new InvalidMfaCodeError();
    }

    const recoveryCodes = generateRecoveryCodes();
    const activated = await this.usersService.activateMfa(
      userId,
      user.mfaPendingSecret,
      recoveryCodes.map(hashRecoveryCode),
    );

    if (!activated) {
      throw new MfaAlreadyEnabledError();
    }

    // A refresh token issued before MFA must not bypass the second factor.
    await this.sessionService.revokeAll(userId);

    return { recoveryCodes };
  }

  async verify(userId: string, code: string): Promise<void> {
    const user = await this.getUser(userId);

    this.assertEnabled(user);
    this.assertNotLocked(user);

    if (user.mfaSecret && verifyTotp(user.mfaSecret, code)) {
      await this.usersService.resetMfaFailures(userId);
      return;
    }

    const consumed = await this.usersService.consumeMfaRecoveryCode(
      userId,
      hashRecoveryCode(code),
    );

    if (consumed) {
      await this.usersService.resetMfaFailures(userId);
      return;
    }

    await this.registerFailure(userId);
  }

  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.getUser(userId);

    this.assertEnabled(user);

    const validPassword = await this.cryptoService.compareString(
      password,
      user.password,
    );

    if (!validPassword) {
      throw new InvalidCredentialsError('Invalid password');
    }

    this.assertNotLocked(user);

    const validCode =
      (user.mfaSecret !== undefined && verifyTotp(user.mfaSecret, code)) ||
      (await this.usersService.consumeMfaRecoveryCode(
        userId,
        hashRecoveryCode(code),
      ));

    if (!validCode) {
      await this.registerFailure(userId);
    }

    await this.usersService.disableMfa(userId);
    await this.usersService.resetMfaFailures(userId);
  }

  private async registerFailure(userId: string): Promise<never> {
    const locked = await this.usersService.recordFailedMfa(userId);

    if (locked) {
      throw new AccountLockedError(
        'Account is temporarily locked. Please try again later.',
      );
    }

    throw new InvalidMfaCodeError();
  }

  private assertEnabled(user: User): void {
    if (!user.mfaEnabled) {
      throw new MfaNotEnabledError();
    }
  }

  private assertNotLocked(user: User): void {
    if (user.mfaLockoutUntil && user.mfaLockoutUntil.getTime() > Date.now()) {
      throw new AccountLockedError(
        'Account is temporarily locked. Please try again later.',
      );
    }
  }

  private async getUser(userId: string): Promise<User> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    return user;
  }
}
