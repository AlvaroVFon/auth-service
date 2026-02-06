import { CryptoService } from '../libs/crypto/crypto.service';
import { JwtService } from '../libs/jwt/jwt.service';
import { UsersService } from '../users/users.service';
import { InvalidCredentialsError } from '../common/exceptions/auth.exceptions';
import { Credentials, SignupCredentials } from './auth.interface';
import {
  EMAIL_REGEX,
  OBJECTID_REGEX,
  PASSWORD_REGEX,
} from '../common/constants/regex';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { User } from '../users/users.interface';
import { MailerInterface } from '../libs/mailer/mailer.interface';
import { CodesService } from './codes/codes.service';
import { CodeType } from './codes/code.interface';
import { RefreshTokenService } from './tokens/refresh-token.service';

export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly cryptoService: CryptoService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailerInterface,
    private readonly codeService: CodesService,
    private readonly refreshTokenService: RefreshTokenService,
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

    const isPasswordValid = await this.cryptoService.compareString(
      credentials.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new InvalidCredentialsError('Invalid email or password');
    }

    const { accessToken, refreshToken } = this.jwtService.generateTokens(
      user._id.toString(),
      user.role,
    );

    await this.refreshTokenService.create({
      userId: user._id,
      token: refreshToken,
    });

    return { accessToken, refreshToken };
  }

  async signup(credentials: SignupCredentials): Promise<User> {
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

    const existingUser = await this.usersService.findByEmail(credentials.email);
    if (existingUser) {
      throw new InvalidArgumentError('Invalid email or password');
    }

    const newUser = await this.usersService.create({
      email: credentials.email,
      password: credentials.password,
    });

    const verificationCode = await this.codeService.createSignupCode(
      newUser._id.toString(),
    );

    await this.mailService.sendSignupVerificationEmail(newUser.email, {
      userName: newUser.email,
      code: verificationCode.code,
      link: `https://ourservice.com/verify?userId=${newUser._id}&code=${verificationCode.code}`,
    });

    return newUser;
  }

  async resetPassword(
    userId: string,
    newPassword: string,
    passwordConfirmation: string,
  ): Promise<void> {
    if (!userId) {
      throw new InvalidArgumentError('userId is required');
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

    await this.usersService.updateOneById(userId, { password: newPassword });
  }

  async validateSignupVerificationCode(
    userId: string,
    code: string,
  ): Promise<void> {
    await this.codeService.validateCode(userId, code, CodeType.SIGNUP);
    await this.usersService.updateOneById(userId, { verified: true });
  }

  async logout(userId: string): Promise<void> {
    if (!userId) {
      throw new InvalidArgumentError('userId is required');
    }
    if (OBJECTID_REGEX.test(userId) === false) {
      throw new InvalidArgumentError('userId is not a valid ObjectId');
    }

    const existingToken =
      await this.refreshTokenService.findActiveByUserId(userId);

    if (!existingToken) {
      throw new EntityNotFoundError(
        'No active refresh token found for the given userId',
      );
    }

    await this.refreshTokenService.revokeToken(existingToken._id.toString());
  }
}
