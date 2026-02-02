import { CryptoService } from '../libs/crypto/crypto.service';
import { JwtService } from '../libs/jwt/jwt.service';
import { UsersService } from '../users/users.service';
import { InvalidCredentialsError } from '../common/exceptions/auth.exceptions';
import { Credentials, SignupCredentials } from './auth.interface';
import { EMAIL_REGEX, PASSWORD_REGEX } from '../common/constants/regex';
import { InvalidArgumentError } from '../common/exceptions/base.exception';
import { User } from '../users/users.interface';
import { MailerInterface } from '../libs/mailer/mailer.interface';

export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly cryptoService: CryptoService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailerInterface,
  ) {}

  async login(credentials: Credentials): Promise<string> {
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

    return this.jwtService.generateAccessToken(user._id?.toString(), user.role);
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

    this.mailService
      .sendMailWithTemplate(
        newUser.email,
        'Welcome to Our Service',
        'welcome',
        {
          userName: newUser.email,
          appName: 'Our Service',
          link: 'https://ourservice.com/dashboard',
          year: new Date().getFullYear().toString(),
        },
      )
      .catch(() => {});

    return newUser;
  }
}
