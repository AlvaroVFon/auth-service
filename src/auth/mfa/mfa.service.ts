import type { ApplicationsPort } from '../../applications';
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
import type { SettingsPort } from '../../settings';
import type { User, UsersPort } from '../../users';
import type { SessionService } from '../tokens/session.service';
import { MfaActivation, MfaEnrollment } from './mfa.interface';
import { buildOtpauthUrl } from './otpauth';
import { generateRecoveryCodes, hashRecoveryCode } from './recovery-codes';
import { generateTotpSecret, verifyTotp, verifyTotpStep } from './totp';

export class MfaService {
  constructor(
    private readonly usersService: UsersPort,
    private readonly cryptoService: CryptoService,
    private readonly sessionService: SessionService,
    private readonly issuer: string,
    private readonly settingsService?: SettingsPort,
    private readonly applicationsService?: ApplicationsPort,
  ) {}

  async enroll(
    userId: string,
    password: string,
    audience?: string,
  ): Promise<MfaEnrollment> {
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
        issuer: await this.resolveIssuer(audience),
        account: user.email,
        secret,
      }),
    };
  }

  /**
   * The authenticator entry is branded with the application that issued the
   * token. Tokens without an audience (owner/global flows) keep the service
   * name from the environment.
   */
  private async resolveIssuer(audience?: string): Promise<string> {
    if (!audience || !this.settingsService || !this.applicationsService) {
      return this.issuer;
    }

    const application = await this.applicationsService.findByAudience(audience);

    if (!application) {
      return this.issuer;
    }

    const resolved = await this.settingsService.resolveForApplication(
      application._id.toString(),
    );

    return resolved.appName.value || this.issuer;
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

  async verify(user: User, code: string): Promise<void> {
    this.assertEnabled(user);
    await this.assertNotLocked(user);

    const userId = user._id.toString();

    if (user.mfaSecret) {
      const step = verifyTotpStep(user.mfaSecret, code);

      if (step !== null) {
        // The step is recorded atomically so the same code cannot be
        // replayed while the challenge and the TOTP window are still valid.
        if (await this.usersService.recordMfaStep(userId, step)) {
          await this.usersService.resetMfaFailures(userId);
          return;
        }

        throw await this.mfaFailure(userId);
      }
    }

    const consumed = await this.usersService.consumeMfaRecoveryCode(
      userId,
      hashRecoveryCode(code),
    );

    if (consumed) {
      await this.usersService.resetMfaFailures(userId);
      return;
    }

    throw await this.mfaFailure(userId);
  }

  async disable(userId: string, password: string, code: string): Promise<void> {
    const user = await this.getUser(userId);

    this.assertEnabled(user);
    await this.assertNotLocked(user);

    const validPassword = await this.cryptoService.compareString(
      password,
      user.password,
    );

    if (!validPassword) {
      throw new InvalidCredentialsError('Invalid password');
    }

    const validCode =
      (user.mfaSecret !== undefined && verifyTotp(user.mfaSecret, code)) ||
      (await this.usersService.consumeMfaRecoveryCode(
        userId,
        hashRecoveryCode(code),
      ));

    if (!validCode) {
      throw await this.mfaFailure(userId);
    }

    await this.usersService.disableMfa(userId);
    await this.usersService.resetMfaFailures(userId);
  }

  private async mfaFailure(userId: string): Promise<Error> {
    const locked = await this.usersService.recordFailedMfa(userId);

    return locked
      ? new AccountLockedError(
          'Account is temporarily locked. Please try again later.',
        )
      : new InvalidMfaCodeError();
  }

  private assertEnabled(user: User): void {
    if (!user.mfaEnabled) {
      throw new MfaNotEnabledError();
    }
  }

  private async assertNotLocked(user: User): Promise<void> {
    if (user.mfaLockoutUntil && user.mfaLockoutUntil.getTime() > Date.now()) {
      throw new AccountLockedError(
        'Account is temporarily locked. Please try again later.',
      );
    }

    // An expired lockout must start a fresh attempt window, otherwise the
    // first wrong code re-locks the account for another full duration.
    if (user.mfaLockoutUntil) {
      await this.usersService.resetMfaFailures(user._id.toString());
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
