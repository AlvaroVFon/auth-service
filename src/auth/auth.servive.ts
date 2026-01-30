import { CryptoService } from '../libs/crypto/crypto.service';
import { JwtService } from '../libs/jwt/jwt.service';
import { UsersService } from '../users/users.service';
import { InvalidCredentialsError } from '../common/exceptions/auth.exceptions';
import { Credentials, SignupCredentials } from './auth.interface';
import { EMAIL_REGEX, PASSWORD_REGEX } from '../common/constants/regex';
import { EntityAlreadyExistsError } from '../common/exceptions/base.exception';
import { User } from '../users/users.interface';

export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly cryptoService: CryptoService,
    private readonly jwtService: JwtService,
  ) {}

  async login(credentials: Credentials): Promise<string> {
    if (!credentials.email || !credentials.password) {
      throw new InvalidCredentialsError('Email and password are required');
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

    return this.jwtService.generateAccessToken(user._id?.toString());
  }

  async signup(credentials: SignupCredentials): Promise<User> {
    if (!credentials.email) {
      throw new InvalidCredentialsError('Email is required');
    }
    if (EMAIL_REGEX.test(credentials.email) === false) {
      throw new InvalidCredentialsError('Invalid email format');
    }
    if (!credentials.password) {
      throw new InvalidCredentialsError('Password is required');
    }
    if (PASSWORD_REGEX.test(credentials.password) === false) {
      throw new InvalidCredentialsError(
        'Password does not meet complexity requirements',
      );
    }
    if (!credentials.passwordConfirmation) {
      throw new InvalidCredentialsError('Password confirmation is required');
    }
    if (credentials.password !== credentials.passwordConfirmation) {
      throw new InvalidCredentialsError(
        'Password and password confirmation do not match',
      );
    }

    const existingUser = await this.usersService.findByEmail(credentials.email);
    if (existingUser) {
      throw new EntityAlreadyExistsError('Email is already in use');
    }

    return this.usersService.create({
      email: credentials.email,
      password: credentials.password,
    });
  }
}
