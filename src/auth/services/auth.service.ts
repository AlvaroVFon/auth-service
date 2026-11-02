import { AuditEvent, AuditPort, AuditResult } from '../../audit';
import {
  EMAIL_REGEX,
  OBJECTID_REGEX,
  PASSWORD_REGEX,
} from '../../common/constants/regex';
import { normalizeEmail } from '../../common/email';
import { Roles } from '../../common/enums/roles.enum';
import {
  AccountLockedError,
  ForbiddenError,
  InvalidCredentialsError,
  UnauthorizedError,
} from '../../common/exceptions/auth.exceptions';
import {
  EntityNotFoundError,
  InvalidArgumentError,
} from '../../common/exceptions/base.exception';
import { AlreadyGeneratedCodeError } from '../../common/exceptions/codes.exceptions';
import { TokenBlacklistPort } from '../../common/ports/token-blacklist.port';
import { Holder, HoldersPort } from '../../holders';
import { JwtService, TokenTypes } from '../../libs/jwt';
import type { TokenRole } from '../../libs/jwt';
import { LoggerInterface } from '../../libs/logger/logger.interface';
import { User, UsersPort } from '../../users';
import { Credentials, SignupCredentials } from '../auth.interface';
import { Code, CodeType } from '../codes/code.interface';
import { CodesService } from '../codes/codes.service';
import { ApplicationTokenService } from '../tokens/application-token.service';
import { RequestContext } from '../tokens/request-context.type';
import { SessionService, SessionView } from '../tokens/session.service';
import { AuthMailer } from './auth-mailer';

export class AuthService {
  constructor(
    private readonly usersService: UsersPort,
    private readonly authMailer: AuthMailer,
    private readonly codeService: CodesService,
    private readonly sessionService: SessionService,
    private readonly blacklistService: TokenBlacklistPort,
    private readonly holdersService: HoldersPort,
    private readonly applicationTokens: ApplicationTokenService,
    private readonly jwtService: JwtService,
    private readonly auditService: AuditPort,
    private readonly logger: LoggerInterface,
  ) {}

  private async resolveResetPasswordCode(userId: string): Promise<Code> {
    try {
      return await this.codeService.create(userId, CodeType.RESET_PASSWORD);
    } catch (error) {
      if (!(error instanceof AlreadyGeneratedCodeError)) {
        throw error;
      }

      const existingCode = await this.codeService.findValidCode(
        userId,
        CodeType.RESET_PASSWORD,
      );

      if (!existingCode) {
        throw error;
      }

      return existingCode;
    }
  }

  private async sendResetPasswordEmail(user: User, code: Code): Promise<void> {
    try {
      await this.authMailer.sendResetPasswordEmail(
        user.email,
        user._id.toString(),
        code.code,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to send password reset email for user ${user._id.toString()}`,
        error,
      );

      try {
        await this.codeService.deleteById(code._id.toString());
      } catch (deleteError) {
        this.logger.warn(
          `Failed to clean up password reset code for user ${user._id.toString()}`,
          deleteError,
        );
      }
    }
  }

  private assertVerified(user: { verified: boolean }): void {
    if (!user.verified) {
      throw new ForbiddenError('Email is not verified');
    }
  }

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

    const application =
      typeof credentials.application === 'string'
        ? credentials.application.trim()
        : '';

    let user: User;
    try {
      user = await this.usersService.verifyCredentials(
        email,
        credentials.password,
      );
    } catch (error) {
      if (
        error instanceof AccountLockedError ||
        error instanceof InvalidCredentialsError
      ) {
        await this.recordLoginFailure(
          error instanceof AccountLockedError
            ? AuditEvent.ACCOUNT_LOCKED
            : AuditEvent.LOGIN_FAILED,
          email,
          application,
          ctx,
        );
      } else {
        // Do not label an infrastructure failure as a credential attack.
        this.logger.warn(`Unexpected login failure for ${email}`, error);
      }

      throw error;
    }

    const userId = user._id.toString();
    let applicationId: string | undefined;
    let audience: string | undefined;

    try {
      this.assertVerified(user);

      if (application) {
        const access = await this.applicationTokens.resolveAccess(
          userId,
          application,
          user,
        );
        applicationId = access.application._id.toString();
        audience = access.application.audience;

        const session = await this.sessionService.create(
          userId,
          access.role,
          ctx,
          access.application.audience,
        );
        await this.auditService.record({
          event: AuditEvent.LOGIN_SUCCEEDED,
          result: AuditResult.SUCCESS,
          userId,
          email,
          applicationId,
          audience,
          role: access.role,
          ...this.auditContext(ctx),
        });

        return {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
        };
      }

      // Only the global owner can log in without an application; every other
      // account must prove a grant on the application it wants a token for.
      if (user.role !== Roles.OWNER) {
        throw new ForbiddenError('An application is required');
      }

      const session = await this.sessionService.create(userId, user.role, ctx);
      await this.auditService.record({
        event: AuditEvent.LOGIN_SUCCEEDED,
        result: AuditResult.SUCCESS,
        userId,
        email,
        role: user.role,
        ...this.auditContext(ctx),
      });

      return {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
      };
    } catch (error) {
      // Post-credential denials (unverified account, missing grant, non-owner
      // without application) are the probing pattern an audit log must show.
      await this.auditService.record({
        event: AuditEvent.LOGIN_FAILED,
        result: AuditResult.FAILURE,
        userId,
        email,
        ...(applicationId === undefined ? {} : { applicationId }),
        ...(application ? { audience: audience ?? application } : {}),
        ...this.auditContext(ctx),
      });
      throw error;
    }
  }

  private async recordLoginFailure(
    event: AuditEvent,
    email: string,
    application: string,
    ctx?: RequestContext,
  ): Promise<void> {
    let userId: string | undefined;

    try {
      const failedUser = await this.usersService.findByEmail(email);
      userId = failedUser?._id.toString();
    } catch (error) {
      this.logger.warn(`Failed to resolve the user for ${email}`, error);
    }

    await this.auditService.record({
      event,
      result: AuditResult.FAILURE,
      ...(userId === undefined ? {} : { userId }),
      email,
      ...(application ? { audience: application } : {}),
      ...this.auditContext(ctx),
    });
  }

  private auditContext(ctx?: RequestContext): {
    ipAddress?: string;
    userAgent?: string;
  } {
    return {
      ...(ctx?.ipAddress === undefined ? {} : { ipAddress: ctx.ipAddress }),
      ...(ctx?.userAgent === undefined ? {} : { userAgent: ctx.userAgent }),
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
      const code = await this.resolveResetPasswordCode(user._id.toString());
      void this.sendResetPasswordEmail(user, code);
    } catch (error) {
      this.logger.warn(
        `Failed to prepare password reset code for user ${user._id.toString()}`,
        error,
      );
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
    refreshToken: string,
    ctx?: RequestContext,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    if (!refreshToken) {
      throw new InvalidArgumentError('refreshToken is required');
    }

    const claims = this.jwtService.verifyToken(refreshToken);

    if (claims.type !== TokenTypes.REFRESH || !claims.userId || !claims.jti) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const userId = claims.userId;
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new EntityNotFoundError('User not found');
    }

    this.assertVerified(user);

    const audience = claims.aud;
    let role: TokenRole = user.role;
    let applicationId: string | undefined;

    if (audience === undefined) {
      // Global tokens are owner-only. Refresh tokens issued before the
      // application scoping must not keep minting global tokens for users.
      if (user.role !== Roles.OWNER) {
        throw new ForbiddenError('An application is required');
      }
    } else {
      try {
        const access = await this.applicationTokens.resolveAccessByAudience(
          userId,
          audience,
          user,
        );
        role = access.role;
        applicationId = access.application._id.toString();
      } catch (error) {
        // A revoked grant or inactive application must end the session
        // permanently, not just fail until access is restored.
        try {
          await this.sessionService.revokeByRefreshToken(userId, refreshToken);
        } catch (revokeError) {
          this.logger.warn(
            `Failed to revoke refresh token after access denial for user ${userId}`,
            revokeError,
          );
        }
        throw error;
      }
    }

    const session = await this.sessionService.rotate(claims, role, ctx);
    await this.auditService.record({
      event: AuditEvent.TOKEN_REFRESHED,
      result: AuditResult.SUCCESS,
      userId,
      email: user.email,
      ...(applicationId === undefined ? {} : { applicationId }),
      ...(audience === undefined ? {} : { audience }),
      role,
      ...this.auditContext(ctx),
    });

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    };
  }

  async listSessions(userId: string): Promise<SessionView[]> {
    return this.sessionService.list(userId);
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    ctx?: RequestContext,
  ): Promise<void> {
    await this.sessionService.revoke(userId, sessionId);
    await this.auditService.record({
      event: AuditEvent.SESSION_REVOKED,
      result: AuditResult.SUCCESS,
      userId,
      sessionId,
      ...this.auditContext(ctx),
    });
  }

  async revokeAllSessions(userId: string, ctx?: RequestContext): Promise<void> {
    await this.sessionService.revokeAll(userId);
    await this.auditService.record({
      event: AuditEvent.SESSIONS_REVOKED,
      result: AuditResult.SUCCESS,
      userId,
      ...this.auditContext(ctx),
    });
  }

  async logout(
    userId: string,
    accessJti?: string,
    accessExpiresAt?: Date,
    audience?: string,
    ctx?: RequestContext,
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

    // An application-scoped token may only revoke sessions of its own
    // audience; otherwise any app could terminate sessions of every other app.
    await this.sessionService.revokeAll(userId, audience);
    await this.auditService.record({
      event: AuditEvent.LOGGED_OUT,
      result: AuditResult.SUCCESS,
      userId,
      ...this.auditContext(ctx),
    });
  }
}
