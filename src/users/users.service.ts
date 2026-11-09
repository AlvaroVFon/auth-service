import { Model, UpdateQuery } from 'mongoose';

import { AuditEvent, AuditPort, AuditResult } from '../audit';
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
import {
  buildPaginatedResult,
  buildSearchRegex,
  buildSortObject,
  type ListQuery,
  type PaginatedResult,
} from '../common/pagination';
import type { RequestAuditContext } from '../common/request-context';
import { normalizeTelegramChatId } from '../common/telegram-chat-id';
import { CryptoService, SecretCipher } from '../libs/crypto';
import { User as UserInterface } from '../users/users.interface';
import type { UserUpdatePayload } from './user-update-payload';
import type {
  UserGrantsCleanerPort,
  UserListItem,
  UserSessionRevokerPort,
  UserSortField,
  UserSessionsPort,
  UserSessionView,
  UsersPort,
} from './users.port';

/** Request context attached to an owner support action in the audit trail. */
export interface UserSupportActionContext extends RequestAuditContext {
  actorId?: string;
}

/**
 * Inclusion projection: a path added to the schema later is not shipped until
 * it is listed here, so the listing fails closed instead of leaking a secret.
 */
const USER_LIST_PROJECTION = [
  'username',
  'email',
  'role',
  'verified',
  'telegramChatId',
  'mfaEnabled',
  'createdAt',
  'updatedAt',
].join(' ');

export class UsersService implements UsersPort {
  private grantsCleaner?: UserGrantsCleanerPort;
  private sessionRevoker?: UserSessionRevokerPort;
  private sessionManager?: UserSessionsPort;

  constructor(
    private readonly usersModel: Model<UserInterface>,
    private readonly cryptoService: CryptoService,
    private readonly maxLoginAttempts: number = 5,
    private readonly lockoutDurationMs: number = 900000,
    private readonly mfaCipher?: SecretCipher,
    private readonly auditService?: AuditPort,
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
    this.assertValidId(id);

    const user = await this.usersModel.findById(id);

    if (user) {
      this.decryptMfaSecrets(user);
    }

    return user;
  }

  /**
   * Paginated management listing. The indexes serve the ordering (including the
   * `_id` tie break); the case-insensitive `q` prefix search intentionally
   * scans the collection because MongoDB cannot use a b-tree index for a regex
   * with the `i` flag.
   */
  async findAll(
    query: ListQuery<UserSortField>,
  ): Promise<PaginatedResult<UserListItem>> {
    const filter = query.q
      ? {
          $or: [
            { email: buildSearchRegex(query.q) },
            { username: buildSearchRegex(query.q) },
          ],
        }
      : {};

    const [items, total] = await Promise.all([
      this.usersModel
        .find(filter)
        .select(USER_LIST_PROJECTION)
        .sort(buildSortObject(query.sort))
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean<UserListItem[]>(),
      this.usersModel.countDocuments(filter),
    ]);

    return buildPaginatedResult(items, total, query);
  }

  /**
   * Clears every lockout counter of the account. The owner is never a valid
   * target: it is reported as missing, exactly like an unknown id, so the
   * support surface cannot be used to discover or lock the owner.
   */
  async unlock(
    id: string,
    context: UserSupportActionContext = {},
  ): Promise<UserInterface> {
    this.assertValidId(id);

    const user = await this.usersModel.findOneAndUpdate(
      { _id: id, role: { $ne: Roles.OWNER } },
      {
        $set: {
          loginAttempts: 0,
          lockoutUntil: null,
          mfaFailedAttempts: 0,
          mfaLockoutUntil: null,
        },
      },
      { returnDocument: 'after' },
    );

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    await this.recordSupportEvent(AuditEvent.USER_UNLOCKED, id, context);

    return user;
  }

  /** Marks a manually created account as verified without touching anything else. */
  async markVerified(
    id: string,
    context: UserSupportActionContext = {},
  ): Promise<UserInterface> {
    this.assertValidId(id);

    const user = await this.usersModel.findOneAndUpdate(
      { _id: id, role: { $ne: Roles.OWNER } },
      { $set: { verified: true } },
      { returnDocument: 'after' },
    );

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    await this.recordSupportEvent(AuditEvent.USER_VERIFIED, id, context);

    return user;
  }

  private assertValidId(id: string): void {
    if (!id) {
      throw new InvalidArgumentError('ID is required');
    }
    if (!OBJECTID_REGEX.test(id)) {
      throw new InvalidArgumentError('Invalid ID format');
    }
  }

  private async recordSupportEvent(
    event:
      | AuditEvent.USER_UNLOCKED
      | AuditEvent.USER_VERIFIED
      | AuditEvent.SESSION_REVOKED_BY_ADMIN
      | AuditEvent.USER_MFA_RESET,
    targetUserId: string,
    context: UserSupportActionContext,
    sessionId?: string,
  ): Promise<void> {
    if (!this.auditService) {
      return;
    }

    await this.auditService.record({
      event,
      result: AuditResult.SUCCESS,
      targetUserId,
      ...(context.actorId === undefined ? {} : { actorId: context.actorId }),
      ...(context.ipAddress === undefined
        ? {}
        : { ipAddress: context.ipAddress }),
      ...(context.userAgent === undefined
        ? {}
        : { userAgent: context.userAgent }),
      ...(sessionId === undefined ? {} : { sessionId }),
    });
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

  setSessionManager(lister: UserSessionsPort): void {
    this.sessionManager = lister;
  }

  /**
   * Lists the active sessions of the target user. The owner is reported as
   * missing, like an unknown id, so the support surface never exposes it.
   */
  async listSessions(id: string): Promise<UserSessionView[]> {
    await this.assertSessionTarget(id);

    return this.requireSessionPort().listSessions(id);
  }

  /** Revokes one session of the target and audits the session id. */
  async revokeSession(
    id: string,
    sessionId: string,
    context: UserSupportActionContext = {},
  ): Promise<void> {
    await this.assertSessionTarget(id);

    const revoked = await this.requireSessionPort().revokeSession(
      id,
      sessionId,
    );

    if (revoked) {
      await this.recordSupportEvent(
        AuditEvent.SESSION_REVOKED_BY_ADMIN,
        id,
        context,
        sessionId,
      );
    }
  }

  /** Revokes every session of the target across audiences, auditing each one. */
  async revokeAllSessions(
    id: string,
    context: UserSupportActionContext = {},
  ): Promise<void> {
    await this.assertSessionTarget(id);

    // Audit exactly the sessions the revocation reported, not a pre-list
    // snapshot that concurrent logins could make stale.
    const { sessionIds, complete } =
      await this.requireSessionPort().revokeAllSessions(id);

    for (const sessionId of sessionIds) {
      await this.recordSupportEvent(
        AuditEvent.SESSION_REVOKED_BY_ADMIN,
        id,
        context,
        sessionId,
      );
    }

    // Surface the incompleteness after auditing: a token that survived the
    // bounded passes must not be reported as a successful revoke-all.
    if (!complete) {
      throw new Error('Session revocation incomplete');
    }
  }

  /** Validates the id and resolves the target, excluding the owner. */
  private async assertSessionTarget(id: string): Promise<void> {
    this.assertValidId(id);

    const user = await this.usersModel
      .findOne({ _id: id, role: { $ne: Roles.OWNER } })
      .select('_id');

    if (!user) {
      throw new EntityNotFoundError('User not found');
    }
  }

  private requireSessionPort(): UserSessionsPort {
    if (!this.sessionManager) {
      throw new Error('Session manager is not configured');
    }

    return this.sessionManager;
  }

  async updateOneById(
    id: string,
    updateData: UserUpdatePayload,
  ): Promise<UserInterface | null> {
    this.assertValidId(id);

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
      const current = await this.usersModel.findById(id).select('email role');

      if (!current) {
        throw new EntityNotFoundError('User not found');
      }

      if (normalizeEmail(current.email) !== normalizeEmail(updateData.email)) {
        // The owner email is the bootstrap identity: changing it is rejected
        // instead of leaving the singleton account unverified and unrecoverable.
        if (current.role === Roles.OWNER) {
          throw new ForbiddenError(
            'The owner email cannot be changed through the API',
          );
        }

        // Nobody has proved the new address yet: the account must not keep
        // logging in and receiving reset links on an address it no longer
        // controls. The owner re-verifies it through POST /users/:id/verify.
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

  /** Marks a successful authentication; it never revalidates credentials. */
  async recordLogin(id: string): Promise<void> {
    this.assertValidId(id);

    await this.usersModel.updateOne(
      { _id: id },
      { $set: { lastLoginAt: new Date() } },
    );
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

  /**
   * Owner support action: removes every MFA artefact of the target and closes
   * all of its sessions. The owner is never a valid target and is reported as
   * missing, like an unknown id.
   */
  async resetMfa(
    id: string,
    context: UserSupportActionContext = {},
  ): Promise<void> {
    this.assertValidId(id);

    const target = await this.usersModel
      .findOne({ _id: id, role: { $ne: Roles.OWNER } })
      .select('_id');

    if (!target) {
      throw new EntityNotFoundError('User not found');
    }

    // Fail closed before touching the document: leaving MFA disabled while the
    // sessions issued with the old factor stay alive defeats the reset.
    if (!this.sessionRevoker) {
      throw new Error('Session revoker is not configured');
    }

    // Close the sessions first: if this fails, MFA stays enabled and the
    // account is still protected instead of losing its second factor while
    // old refresh tokens remain usable.
    await this.sessionRevoker.revokeAll(id);
    await this.disableMfa(id);
    await this.recordSupportEvent(AuditEvent.USER_MFA_RESET, id, context);
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
    this.assertValidId(id);

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
