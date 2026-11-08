import { Model, UpdateQuery } from 'mongoose';

import {
  EMAIL_REGEX,
  OBJECTID_REGEX,
  PASSWORD_REGEX,
} from '../common/constants/regex';
import { normalizeEmail } from '../common/email';
import { Roles } from '../common/enums/roles.enum';
import {
  AccountLockedError,
  ForbiddenError,
  InvalidCredentialsError,
} from '../common/exceptions/auth.exceptions';
import {
  EntityAlreadyExistsError,
  EntityNotFoundError,
  InvalidArgumentError,
} from '../common/exceptions/base.exception';
import { isDuplicateKeyError } from '../common/mongo/duplicate-key';
import { normalizeTelegramChatId } from '../common/telegram-chat-id';
import { CryptoService, SecretCipher } from '../libs/crypto';
import { User as UserInterface } from '../users/users.interface';
import type { UserUpdatePayload } from './user-update-payload';
import type {
  UserGrantsCleanerPort,
  UserSessionRevokerPort,
  UserSessionsPort,
  UserSessionView,
  UsersPort,
} from './users.port';

export class UsersService implements UsersPort {
  private grantsCleaner?: UserGrantsCleanerPort;
  private sessionRevoker?: UserSessionRevokerPort;
  private sessionLister?: UserSessionsPort;

  constructor(
    private readonly usersModel: Model<UserInterface>,
    private readonly cryptoService: CryptoService,
    private readonly maxLoginAttempts: number = 5,
    private readonly lockoutDurationMs: number = 900000,
    private readonly mfaCipher?: SecretCipher,
  ) {}

  async create(data: Partial<UserInterface>): Promise<UserInterface> {
    if (!data.email) {
      throw new InvalidArgumentError('Email is required to create a user');
    }

    const email = normalizeEmail(data.email);

    if (!EMAIL_REGEX.test(email)) {
      throw new InvalidArgumentError('Invalid email format');
    }
    if (!data.password) {
      throw new InvalidArgumentError('Password is required to create a user');
    }

    const password = await this.cryptoService.hashString(data.password);

    const existingUser = await this.usersModel.findOne({ email });
    if (existingUser) {
      throw new EntityAlreadyExistsError('Email already exists');
    }

    return this.usersModel.create({
      ...data,
      email,
      password,
      verified: data.verified ?? true,
    });
  }

  async createOwner(email: string, password: string): Promise<UserInterface> {
    const normalizedEmail = normalizeEmail(email);
    if (!email || !EMAIL_REGEX.test(normalizedEmail)) {
      throw new InvalidArgumentError('Invalid email format');
    }
    if (!password || !PASSWORD_REGEX.test(password)) {
      throw new InvalidArgumentError(
        'Password does not meet complexity requirements',
      );
    }

    return this.create({
      email: normalizedEmail,
      password,
      role: Roles.OWNER,
      verified: true,
    });
  }

  async createVerifiedUser(input: {
    email: string;
    passwordHash: string;
  }): Promise<UserInterface> {
    const email = normalizeEmail(input.email);
    const existingUser = await this.usersModel.findOne({ email });
    if (existingUser) {
      throw new EntityAlreadyExistsError('Email already exists');
    }

    try {
      return await this.usersModel.create({
        email,
        password: input.passwordHash,
        verified: true,
      });
    } catch (error) {
      // Two concurrent acceptances can pass the pre-check: the unique index is
      // the final guard and must surface the same domain error.
      if (isDuplicateKeyError(error)) {
        throw new EntityAlreadyExistsError('Email already exists');
      }
      throw error;
    }
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

    // An expired lockout must start a fresh attempt window, otherwise the first
    // wrong password would push the counter over the limit and re-lock.
    if (user.lockoutUntil) {
      await this.resetLoginAttempts(user._id.toString());
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

    const normalizedEmail = normalizeEmail(email);

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new InvalidArgumentError('Invalid email format');
    }

    return this.usersModel.findOne({ email: normalizedEmail });
  }

  async findById(id: string): Promise<UserInterface | null> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    const user = await this.usersModel.findById(id);

    if (user) {
      this.decryptMfaSecrets(user);
    }

    return user;
  }

  async findAll(): Promise<UserInterface[]> {
    return this.usersModel.find();
  }

  async findByRole(role: Roles): Promise<UserInterface | null> {
    if (!Object.values(Roles).includes(role)) {
      throw new InvalidArgumentError('Invalid role');
    }

    return this.usersModel.findOne({ role });
  }

  setGrantsCleaner(cleaner: UserGrantsCleanerPort): void {
    this.grantsCleaner = cleaner;
  }

  setSessionRevoker(revoker: UserSessionRevokerPort): void {
    this.sessionRevoker = revoker;
  }

  setSessionLister(lister: UserSessionsPort): void {
    this.sessionLister = lister;
  }

  /**
   * Lists the active sessions of the target user. The owner is reported as
   * missing, like an unknown id, so the support surface never exposes it.
   */
  async listSessions(id: string): Promise<UserSessionView[]> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    const user = await this.usersModel
      .findOne({ _id: id, role: { $ne: Roles.OWNER } })
      .select('_id');

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    if (!this.sessionLister) {
      throw new Error('Session lister is not configured');
    }

    return this.sessionLister.listSessions(id);
  }

  async updateOneById(
    id: string,
    updateData: UserUpdatePayload,
  ): Promise<UserInterface | null> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    let passwordRevoker: UserSessionRevokerPort | undefined;

    if (updateData.password !== undefined) {
      if (updateData.password.trim().length === 0) {
        throw new InvalidArgumentError('Password must not be empty');
      }
      // Fail closed before touching the document: rotating the password without
      // a revoker would leave every session issued with the old one alive.
      if (!this.sessionRevoker) {
        throw new Error('Session revoker is not configured');
      }
      passwordRevoker = this.sessionRevoker;
    }

    const update: UpdateQuery<UserInterface> = { $set: { ...updateData } };
    const set = update.$set as Record<string, unknown>;

    if (updateData.email !== undefined) {
      const current = await this.usersModel.findById(id).select('email');

      if (!current) {
        throw new EntityNotFoundError('User not found');
      }

      // The owner can change the address, but nobody has proved it yet: a
      // verified account must not keep logging in and receiving reset links on
      // an address it no longer controls.
      if (normalizeEmail(current.email) !== normalizeEmail(updateData.email)) {
        set.verified = false;
      }
    }

    // Hash into the copy: mutating the caller's payload would hash an
    // already-hashed password if the same object is reused.
    if (updateData.password !== undefined) {
      set.password = await this.cryptoService.hashString(updateData.password);
    }

    if ('telegramChatId' in updateData) {
      const telegramChatId = normalizeTelegramChatId(updateData.telegramChatId);
      delete set.telegramChatId;

      if (telegramChatId === undefined) {
        // null/empty is an explicit request to unregister the chat.
        update.$unset = { telegramChatId: 1 };
      } else {
        set.telegramChatId = telegramChatId;
      }
    }

    let user: UserInterface | null;

    try {
      user = await this.usersModel.findByIdAndUpdate(id, update, {
        returnDocument: 'after',
      });
    } catch (error) {
      // Email keeps a unique index: a duplicate must surface as a domain error
      // instead of leaking the raw E11000 as a 500.
      if (isDuplicateKeyError(error)) {
        throw new EntityAlreadyExistsError('Email already exists');
      }
      throw error;
    }

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    // A rotated password must invalidate every session issued with the old one,
    // exactly like the reset flow does.
    if (passwordRevoker) {
      await passwordRevoker.revokeAll(id);
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

  async setMfaPendingSecret(id: string, secret: string): Promise<void> {
    const user = await this.usersModel.findByIdAndUpdate(id, {
      $set: { mfaPendingSecret: this.encryptMfaSecret(secret) },
    });

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }
  }

  async activateMfa(
    id: string,
    secret: string,
    recoveryCodeHashes: string[],
  ): Promise<boolean> {
    const user = await this.usersModel.findOneAndUpdate(
      { _id: id, mfaEnabled: { $ne: true } },
      {
        $set: {
          mfaEnabled: true,
          mfaSecret: this.encryptMfaSecret(secret),
          mfaRecoveryCodes: recoveryCodeHashes,
          mfaFailedAttempts: 0,
          mfaLockoutUntil: null,
        },
        $unset: { mfaPendingSecret: '' },
      },
      { returnDocument: 'after' },
    );

    return user !== null;
  }

  async disableMfa(id: string): Promise<void> {
    const user = await this.usersModel.findByIdAndUpdate(id, {
      $set: {
        mfaEnabled: false,
        mfaFailedAttempts: 0,
        mfaLockoutUntil: null,
      },
      $unset: {
        mfaSecret: '',
        mfaPendingSecret: '',
        mfaRecoveryCodes: '',
        mfaLastUsedStep: '',
      },
    });

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }
  }

  async recordFailedMfa(id: string): Promise<boolean> {
    const user = await this.usersModel.findByIdAndUpdate(
      id,
      { $inc: { mfaFailedAttempts: 1 } },
      { returnDocument: 'after' },
    );

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    if ((user.mfaFailedAttempts ?? 0) < this.maxLoginAttempts) {
      return false;
    }

    await this.usersModel.findByIdAndUpdate(id, {
      $set: {
        mfaLockoutUntil: new Date(Date.now() + this.lockoutDurationMs),
      },
    });

    return true;
  }

  async recordMfaStep(id: string, step: number): Promise<boolean> {
    const result = await this.usersModel.updateOne(
      {
        _id: id,
        $or: [
          { mfaLastUsedStep: { $exists: false } },
          { mfaLastUsedStep: { $lt: step } },
        ],
      },
      { $set: { mfaLastUsedStep: step } },
    );

    return result.modifiedCount === 1;
  }

  async resetMfaFailures(id: string): Promise<void> {
    await this.usersModel.findByIdAndUpdate(id, {
      $set: { mfaFailedAttempts: 0, mfaLockoutUntil: null },
    });
  }

  async consumeMfaRecoveryCode(id: string, codeHash: string): Promise<boolean> {
    const result = await this.usersModel.updateOne(
      { _id: id, mfaRecoveryCodes: codeHash },
      { $pull: { mfaRecoveryCodes: codeHash } },
    );

    return result.modifiedCount === 1;
  }

  private encryptMfaSecret(secret: string): string {
    return this.mfaCipher ? this.mfaCipher.encrypt(secret) : secret;
  }

  private decryptMfaSecrets(user: UserInterface): void {
    if (!this.mfaCipher) {
      return;
    }

    if (user.mfaSecret) {
      user.mfaSecret = this.mfaCipher.decrypt(user.mfaSecret);
    }
    if (user.mfaPendingSecret) {
      user.mfaPendingSecret = this.mfaCipher.decrypt(user.mfaPendingSecret);
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

  async deleteOneById(
    id: string,
    actorId?: string,
  ): Promise<UserInterface | null> {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }

    const user = await this.usersModel.findById(id);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    if (user.role === Roles.OWNER) {
      throw new ForbiddenError('The owner cannot be deleted');
    }

    if (!this.grantsCleaner) {
      throw new Error('User grants cleaner is not configured');
    }

    await this.usersModel.findByIdAndDelete(id);

    // Best effort: MongoDB standalone deployments cannot wrap both writes in a
    // transaction, so grants are cleaned after the user is gone. If the cleanup
    // fails the error surfaces, but the deletion is not rolled back.
    await this.grantsCleaner.deleteByUser(id, actorId);

    return user;
  }
}
