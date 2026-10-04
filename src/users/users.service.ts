import { Model } from 'mongoose';

import { EMAIL_REGEX, OBJECTID_REGEX } from '../common/constants/regex';
import {
  AccountLockedError,
  InvalidCredentialsError,
} from '../common/exceptions/auth.exceptions';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { CryptoService } from '../libs/crypto';
import { User as UserInterface } from '../users/users.interface';
import type { UsersPort } from './users.port';

export class UsersService implements UsersPort {
  constructor(
    private readonly usersModel: Model<UserInterface>,
    private readonly cryptoService: CryptoService,
    private readonly maxLoginAttempts: number = 5,
    private readonly lockoutDurationMs: number = 900000,
  ) {}

  async create(data: Partial<UserInterface>): Promise<UserInterface> {
    if (!data.email) {
      throw new InvalidArgumentError('Email is required to create a user');
    }
    if (!EMAIL_REGEX.test(data.email)) {
      throw new InvalidArgumentError('Invalid email format');
    }
    if (!data.password) {
      throw new InvalidArgumentError('Password is required to create a user');
    }

    data.password = await this.cryptoService.hashString(data.password);

    const existingUser = await this.usersModel.findOne({ email: data.email });
    if (existingUser) {
      throw new EntityAlreadyExistsError('Email already exists');
    }

    return this.usersModel.create(data);
  }

  async createVerifiedUser(input: {
    email: string;
    passwordHash: string;
  }): Promise<UserInterface> {
    const existingUser = await this.usersModel.findOne({ email: input.email });
    if (existingUser) {
      throw new EntityAlreadyExistsError('Email already exists');
    }

    return this.usersModel.create({
      email: input.email,
      password: input.passwordHash,
      verified: true,
    });
  }

  async verifyCredentials(
    email: string,
    password: string,
  ): Promise<UserInterface> {
    const user = await this.findByEmail(email);
    if (!user) {
      throw new InvalidCredentialsError('Invalid email or password');
    }

    if (this.isAccountLocked(user)) {
      throw new AccountLockedError(
        'Account is temporarily locked. Please try again later.',
      );
    }

    const isPasswordValid = await this.cryptoService.compareString(
      password,
      user.password,
    );

    if (!isPasswordValid) {
      await this.recordFailedLogin(user._id.toString());
      throw new InvalidCredentialsError('Invalid email or password');
    }

    await this.resetLoginAttempts(user._id.toString());

    return user;
  }

  async findByEmail(email: string): Promise<UserInterface | null> {
    if (!email) {
      throw new InvalidArgumentError('Email is required');
    }

    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('Invalid email format');
    }

    return this.usersModel.findOne({ email });
  }

  async findById(id: string): Promise<UserInterface | null> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    const user = await this.usersModel.findById(id);
    return user;
  }

  async findAll(): Promise<UserInterface[]> {
    return this.usersModel.find();
  }

  async updateOneById(
    id: string,
    updateData: Partial<UserInterface>,
  ): Promise<UserInterface | null> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    if (updateData.password) {
      updateData.password = await this.cryptoService.hashString(
        updateData.password,
      );
    }

    const user = await this.usersModel.findByIdAndUpdate(id, updateData, {
      returnDocument: 'after',
    });

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    return user;
  }

  async setPassword(id: string, newPassword: string): Promise<void> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    const hashedPassword = await this.cryptoService.hashString(newPassword);

    const user = await this.usersModel.findByIdAndUpdate(
      id,
      { password: hashedPassword },
      { returnDocument: 'after' },
    );

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }
  }

  private isAccountLocked(user: UserInterface): boolean {
    return !!user.lockoutUntil && user.lockoutUntil.getTime() > Date.now();
  }

  private async recordFailedLogin(id: string): Promise<void> {
    const user = await this.usersModel.findOneAndUpdate(
      { _id: id },
      { $inc: { loginAttempts: 1 } },
      { returnDocument: 'after' },
    );
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    if ((user.loginAttempts ?? 0) < this.maxLoginAttempts) {
      return;
    }

    await this.usersModel.findByIdAndUpdate(id, {
      lockoutUntil: new Date(Date.now() + this.lockoutDurationMs),
    });
  }

  private async resetLoginAttempts(id: string): Promise<void> {
    await this.usersModel.findByIdAndUpdate(id, {
      loginAttempts: 0,
      lockoutUntil: null,
    });
  }

  async deleteOneById(id: string): Promise<UserInterface | null> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    const user = await this.usersModel.findByIdAndDelete(id);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    return user;
  }
}
