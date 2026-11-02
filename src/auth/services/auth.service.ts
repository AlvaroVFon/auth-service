import {
  EMAIL_REGEX,
  OBJECTID_REGEX,
  PASSWORD_REGEX,
} from '../../common/constants/regex';
import { normalizeEmail } from '../../common/email';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../common/exceptions/base.exception';
import { TokenBlacklistPort } from '../../common/ports/token-blacklist.port';
import { Holder, HoldersPort } from '../../holders';
import { LoggerInterface } from '../../libs/logger/logger.interface';
import { UsersPort } from '../../users';
import { Credentials, SignupCredentials } from '../auth.interface';
import { CodeType } from '../codes/code.interface';
import { CodesService } from '../codes/codes.service';
import { RequestContext } from '../tokens/request-context.type';
import { SessionService } from '../tokens/session.service';
import { AuthMailer } from './auth-mailer';

export class AuthService {
  constructor(
    private readonly usersService: UsersPort,
    private readonly authMailer: AuthMailer,
    private readonly codeService: CodesService,
    private readonly sessionService: SessionService,
    private readonly blacklistService: TokenBlacklistPort,
    private readonly holdersService: HoldersPort,
    private readonly logger: LoggerInterface,
  ) {}

  async login(
    credentials: Credentials,
    ctx?: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!credentials.email || !credentials.password) {
      throw new InvalidArgumentError('Email and password are required');
    }

    const email = normalizeEmail(credentials.email);

    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('Invalid email or password');
    }

    const user = await this.usersService.verifyCredentials(
      email,
      credentials.password,
    );

    const session = await this.sessionService.create(
      user._id.toString(),
      user.role,
      ctx,
    );

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  async signup(credentials: SignupCredentials): Promise<Holder> {
    if (!credentials.email) {
      throw new InvalidArgumentError('Email is required');
    }
    const email = normalizeEmail(credentials.email);
    if (EMAIL_REGEX.test(email) === false) {
      throw new InvalidArgumentError('Invalid email format');
    }
    if (!credentials.password) {
      throw new InvalidArgumentError('Password is required');
    }
    if (PASSWORD_REGEX.test(credentials.password) === false) {
      throw new InvalidArgumentError(
        'Password does not meet complexity requirements',
      );
    }
    if (!credentials.passwordConfirmation) {
      throw new InvalidArgumentError('Password confirmation is required');
    }
    if (credentials.password !== credentials.passwordConfirmation) {
      throw new InvalidArgumentError(
        'Password and password confirmation do not match',
      );
    }

    const existingHolder = await this.holdersService.findByEmail(email);

    const existingUser = await this.usersService.findByEmail(email);

    if (existingHolder || existingUser) {
      throw new InvalidArgumentError('Invalid email or password');
    }

    const newHolder = await this.holdersService.create(
      email,
      credentials.password,
    );

    const verificationCode = await this.codeService.create(
      newHolder._id.toString(),
      CodeType.SIGNUP,
    );

    try {
      await this.authMailer.sendSignupVerificationEmail(
        newHolder.email,
        newHolder._id.toString(),
        verificationCode.code,
      );
    } catch (error) {
      await Promise.allSettled([
        this.codeService.deleteById(verificationCode._id.toString()),
        this.holdersService.deleteById(newHolder._id.toString()),
      ]);
      throw error;
    }

    return newHolder;
  }

  async forgotPassword(email: string): Promise<void> {
    if (!email) {
      throw new InvalidArgumentError('email is required');
    }

    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new InvalidArgumentError('email has invalid format');
    }

    const user = await this.usersService.findByEmail(normalizedEmail);
    if (!user) {
      return;
    }

    try {
      const code = await this.codeService.create(
        user._id.toString(),
        CodeType.RESET_PASSWORD,
      );

      void this.authMailer
        .sendResetPasswordEmail(user.email, user._id.toString(), code.code)
        .catch((error: unknown) => {
          this.logger.warn('Failed to send password reset email', error);
        });
    } catch (error) {
      this.logger.warn('Failed to create password reset code', error);
    }
  }

  async resetPassword(
    userId: string,
    code: string,
    newPassword: string,
    passwordConfirmation: string,
  ): Promise<void> {
    if (!userId) {
      throw new InvalidArgumentError('userId is required');
    }
    if (!code) {
      throw new InvalidArgumentError('code is required');
    }
    if (!newPassword) {
      throw new InvalidArgumentError('newPassword is required');
    }
    if (PASSWORD_REGEX.test(newPassword) === false) {
      throw new InvalidArgumentError(
        'Password does not meet complexity requirements',
      );
    }
    if (!passwordConfirmation) {
      throw new InvalidArgumentError('passwordConfirmation is required');
    }
    if (newPassword !== passwordConfirmation) {
      throw new InvalidArgumentError(
        'Password and password confirmation do not match',
      );
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    await this.codeService.validateCode(userId, code, CodeType.RESET_PASSWORD);

    await this.usersService.setPassword(userId, newPassword);
    await this.sessionService.revokeAll(userId);
  }

  async validateSignupVerificationCode(
    holderId: string,
    code: string,
  ): Promise<void> {
    if (!holderId) {
      throw new InvalidArgumentError('holderId is required');
    }

    await this.codeService.validateCode(holderId, code, CodeType.SIGNUP);

    const holder = await this.holdersService.findById(holderId);
    if (!holder) {
      throw new EntityNotFoundError('Holder not found');
    }

    await this.usersService.createVerifiedUser({
      email: holder.email,
      passwordHash: holder.password,
    });
    await this.holdersService.deleteById(holderId);
  }

  async refreshToken(
    userId: string,
    refreshToken: string,
    ctx?: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (OBJECTID_REGEX.test(userId) === false) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }
    if (!refreshToken) {
      throw new InvalidArgumentError('refreshToken is required');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    const session = await this.sessionService.rotate(
      userId,
      user.role,
      refreshToken,
      ctx,
    );

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  async logout(
    userId: string,
    accessJti?: string,
    accessExpiresAt?: Date,
  ): Promise<void> {
    if (!userId) {
      throw new InvalidArgumentError('userId is required');
    }
    if (OBJECTID_REGEX.test(userId) === false) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    if (accessJti && accessExpiresAt) {
      await this.blacklistService.blacklist(accessJti, accessExpiresAt);
    }

    await this.sessionService.revokeAll(userId);
  }
}
