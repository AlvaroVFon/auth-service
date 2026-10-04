import {
  EMAIL_REGEX,
  OBJECTID_REGEX,
  PASSWORD_REGEX,
} from '../../common/constants/regex';
import {
  AccountLockedError,
  InvalidCredentialsError,
} from '../../common/exceptions/auth.exceptions';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../common/exceptions/base.exception';
import { Holder, HoldersPort } from '../../holders';
import { CryptoService } from '../../libs/crypto';
import { MailerInterface } from '../../libs/mailer';
import { User as UserInterface, UsersPort } from '../../users';
import { Credentials, SignupCredentials } from '../auth.interface';
import { CodeType } from '../codes/code.interface';
import { CodesService } from '../codes/codes.service';
import { BlacklistService } from '../tokens/blacklist.service';
import { RequestContext } from '../tokens/request-context.type';
import { SessionService } from '../tokens/session.service';

export class AuthService {
  constructor(
    private readonly usersService: UsersPort,
    private readonly cryptoService: CryptoService,
    private readonly mailService: MailerInterface,
    private readonly codeService: CodesService,
    private readonly sessionService: SessionService,
    private readonly blacklistService: BlacklistService,
    private readonly holdersService: HoldersPort,
    private readonly maxLoginAttempts: number,
    private readonly lockoutDurationMs: number,
    private readonly publicAppUrl: string = 'https://ourservice.com',
  ) {}

  async login(
    credentials: Credentials,
    ctx?: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!credentials.email || !credentials.password) {
      throw new InvalidArgumentError('Email and password are required');
    }

    if (!EMAIL_REGEX.test(credentials.email)) {
      throw new InvalidArgumentError('Invalid email or password');
    }

    const user = await this.usersService.findByEmail(credentials.email);
    if (!user) {
      throw new InvalidCredentialsError('Invalid email or password');
    }

    if (this.isAccountLocked(user)) {
      throw new AccountLockedError(
        'Account is temporarily locked. Please try again later.',
      );
    }

    const isPasswordValid = await this.cryptoService.compareString(
      credentials.password,
      user.password,
    );

    if (!isPasswordValid) {
      await this.handleFailedLogin(user);
      throw new InvalidCredentialsError('Invalid email or password');
    }

    await this.handleSuccessfulLogin(user);

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

  private isAccountLocked(user: UserInterface): boolean {
    return !!user.lockoutUntil && user.lockoutUntil.getTime() > Date.now();
  }

  private async handleFailedLogin(user: UserInterface): Promise<void> {
    await this.usersService.incrementLoginAttempts(
      user._id.toString(),
      this.maxLoginAttempts,
      this.lockoutDurationMs,
    );
  }

  private async handleSuccessfulLogin(user: UserInterface): Promise<void> {
    await this.usersService.updateOneById(user._id.toString(), {
      loginAttempts: 0,
      lockoutUntil: null,
    });
  }

  async signup(credentials: SignupCredentials): Promise<Holder> {
    if (!credentials.email) {
      throw new InvalidArgumentError('Email is required');
    }
    if (EMAIL_REGEX.test(credentials.email) === false) {
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

    const existingHolder = await this.holdersService.findByEmail(
      credentials.email,
    );

    const existingUser = await this.usersService.findByEmail(credentials.email);

    if (existingHolder || existingUser) {
      throw new InvalidArgumentError('Invalid email or password');
    }

    const newHolder = await this.holdersService.create(
      credentials.email,
      credentials.password,
    );

    const verificationCode = await this.codeService.createSignupCode(
      newHolder._id.toString(),
    );

    await this.mailService.sendSignupVerificationEmail(newHolder.email, {
      userName: newHolder.email,
      code: verificationCode.code,
      link: `${this.publicAppUrl}/verify?holderId=${newHolder._id}&code=${verificationCode.code}`,
    });

    return newHolder;
  }

  async forgotPassword(email: string): Promise<void> {
    if (!email) {
      throw new InvalidArgumentError('email is required');
    }
    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('email has invalid format');
    }

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new EntityNotFoundError(`user with email ${email} not found`);
    }

    const code = await this.codeService.createForgotPasswordCode(
      user._id.toString(),
    );

    await this.mailService.sendResetPasswordEmail(email, {
      username: user.email,
      email,
      code: code.code,
      link: `${this.publicAppUrl}/reset-password?userId=${user._id}&code=${code.code}`,
    });
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

    await this.usersService.updateOneById(userId, { password: newPassword });
  }

  async validateSignupVerificationCode(
    holderId: string,
    code: string,
  ): Promise<void> {
    await this.codeService.validateCode(holderId, code, CodeType.SIGNUP);

    const holder = await this.holdersService.findById(holderId);
    if (!holder) {
      throw new EntityNotFoundError('Holder not found');
    }

    await this.usersService.createFromHolder(holder);
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
