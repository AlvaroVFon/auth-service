import { JwtPayload } from 'jsonwebtoken';
import { CryptoService } from '../../libs/crypto/crypto.service';
import { JwtService } from '../../libs/jwt/jwt.service';
import { UsersService } from '../../users/users.service';
import {
  AccountLockedError,
  InvalidCredentialsError,
  UnauthorizedError,
} from '../../common/exceptions/auth.exceptions';
import { Credentials, SignupCredentials } from '../auth.interface';
import {
  EMAIL_REGEX,
  OBJECTID_REGEX,
  PASSWORD_REGEX,
} from '../../common/constants/regex';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../common/exceptions/base.exception';
import { MailerInterface } from '../../libs/mailer/mailer.interface';
import { CodesService } from '../codes/codes.service';
import { CodeType } from '../codes/code.interface';
import { RefreshTokenService } from '../tokens/refresh-token.service';
import { BlacklistService } from '../tokens/blacklist.service';
import { HoldersService } from '../../holders/holders.service';
import { Holder } from '../../holders/holders.interface';
import { User as UserInterface } from '../../users/users.interface';

export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly cryptoService: CryptoService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailerInterface,
    private readonly codeService: CodesService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly blacklistService: BlacklistService,
    private readonly holdersService: HoldersService,
    private readonly maxLoginAttempts: number,
    private readonly lockoutDurationMs: number,
  ) {}

  async login(
    credentials: Credentials,
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

    const { accessToken, refreshToken } = this.jwtService.generateTokens(
      user._id.toString(),
      user.role,
    );

    const decoded = this.jwtService.verifyToken(refreshToken) as JwtPayload;

    await this.refreshTokenService.revokeAllByUserId(user._id.toString());

    await this.refreshTokenService.create(
      user._id.toString(),
      decoded.jti as string,
      new Date(decoded.exp! * 1000),
    );

    return { accessToken, refreshToken };
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
      link: `https://ourservice.com/verify?holderId=${newHolder._id}&code=${verificationCode.code}`,
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
      link: `https://ourservice.com/reset-password?userId=${user._id}&code=${code.code}`,
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
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (OBJECTID_REGEX.test(userId) === false) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }
    if (!refreshToken) {
      throw new InvalidArgumentError('refreshToken is required');
    }

    const decoded = this.jwtService.verifyToken(refreshToken) as JwtPayload;
    const jti = decoded.jti as string;

    const storedToken = await this.refreshTokenService.findByJti(jti);

    if (!storedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    if (storedToken.revokedAt !== null) {
      throw new UnauthorizedError('Refresh token has been revoked');
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    const { accessToken, refreshToken: newRefreshToken } =
      this.jwtService.generateTokens(userId, user.role);

    const newDecoded = this.jwtService.verifyToken(
      newRefreshToken,
    ) as JwtPayload;

    await this.refreshTokenService.revokeByJti(jti, newDecoded.jti as string);

    await this.refreshTokenService.create(
      userId,
      newDecoded.jti as string,
      new Date(newDecoded.exp! * 1000),
    );

    return { accessToken, refreshToken: newRefreshToken };
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

    await this.refreshTokenService.revokeAllByUserId(userId);
  }
}
