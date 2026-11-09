import { Application } from 'express';

import type { ApplicationsPort } from '../applications';
import { ApplicationsModule } from '../applications/applications.module';
import {
  AuditController,
  AuditModule,
  AuditService,
  createAuditEventModel,
} from '../audit';
import { AuthModule } from '../auth';
import type { AuthRateLimitConfig } from '../auth';
import { CodesModel } from '../auth/codes/codes.schema';
import { CodesService } from '../auth/codes/codes.service';
import { AuthController } from '../auth/controllers/auth.controller';
import { MfaService } from '../auth/mfa';
import { AuthMailer } from '../auth/services/auth-mailer';
import { AuthService } from '../auth/services/auth.service';
import { ProfileService } from '../auth/services/profile.service';
import { ApplicationTokenService } from '../auth/tokens/application-token.service';
import { BlacklistService } from '../auth/tokens/blacklist.service';
import { BlacklistedTokenModel } from '../auth/tokens/blacklisted-token.schema';
import { RefreshTokenModel } from '../auth/tokens/refresh-token.schema';
import { RefreshTokenService } from '../auth/tokens/refresh-token.service';
import { SessionService } from '../auth/tokens/session.service';
import { HttpInterceptor } from '../common/interceptors/exception.interceptor';
import { HttpLoggerInterceptor } from '../common/interceptors/httplogger.interceptor';
import { ApplicationAuthorizationMiddleware } from '../common/middlewares/application-authorization.middleware';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { GrantsPort } from '../grants';
import type { GrantsRateLimitConfig } from '../grants';
import { GrantsModule } from '../grants/grants.module';
import { GrantModel } from '../grants/grants.schema';
import { HealthModule, isHealthProbe } from '../health';
import { HoldersModel } from '../holders/holders.schema';
import { HoldersService } from '../holders/holders.service';
import { JwksModule } from '../jwks';
import { CryptoService, SecretCipher } from '../libs/crypto';
import { JwtKeyring } from '../libs/jwt';
import { JwtService } from '../libs/jwt/jwt.service';
import { WinstonLogger } from '../libs/logger/adapters/winston.logger';
import { LoggerInterface } from '../libs/logger/logger.interface';
import { NodeMailerAdapter } from '../libs/mailer/adapters/nodemailer.adapter';
import { MailerInterface } from '../libs/mailer/mailer.interface';
import { TelegramAdapter, type TelegramPort } from '../libs/telegram';
import { HandlebarsEngine } from '../libs/templates-engine/adapters/handlebars.adapter';
import {
  InvitationsService,
  LinkModel,
  LINKS_BODYLESS_PATHS,
  LinksController,
  LinksModule,
  LinksService,
  LinkNotificationsService,
  PasswordResetLinksService,
} from '../links';
import {
  GlobalSettingsRepository,
  SettingsModule,
  SettingsService,
  type SettingsPort,
} from '../settings';
import { OwnerBootstrapService } from '../users/owner-bootstrap.service';
import { UsersModule } from '../users/users.module';
import { USER_SUPPORT_BODYLESS_PATHS } from '../users/users.router';
import { normalizeCorsOrigins, resolveCorsOrigins } from './cors.config';
import { Database } from './database.config';
import {
  getNumberEnvVariable,
  getStringEnvVariable,
  requireEnvVariable,
} from './env.config';
import { JwtConfig, resolveJwtConfig } from './jwt.config';
import { GlobalMiddlewares } from './middlewares.config';
import { resolveTelegramConfig } from './telegram.config';
import { resolveTrustProxy } from './trust-proxy.config';

export interface ApplicationComposition {
  readonly logger: LoggerInterface;
  readonly database: Database;
  readonly applications: ApplicationsPort;
  readonly grants: GrantsPort;
  readonly settings: SettingsPort;
  readonly usersModule: UsersModule;
  readonly authModule: AuthModule;
  readonly linksModule: LinksModule;
  readonly auditModule: AuditModule;
  readonly ownerBootstrap: OwnerBootstrapService;
  readonly jwtKeyring: JwtKeyring;
  readonly applicationTokens: ApplicationTokenService;
  initialize(app: Application, logger?: LoggerInterface): void;
}

export interface ApplicationCompositionOptions {
  logger?: LoggerInterface;
  mailer?: MailerInterface;
  database?: Database;
  jwtConfig?: JwtConfig;
  jwtSecret?: string;
  jwtIssuer?: string;
  jwtExpiresIn?: number;
  refreshTokenExpiresIn?: number;
  maxLoginAttempts?: number;
  lockoutDurationMs?: number;
  publicAppUrl?: string;
  rateLimitConfig?: AuthRateLimitConfig;
  grantsRateLimit?: GrantsRateLimitConfig;
  corsOrigins?: string[];
  trustProxy?: boolean | number;
  telegram?: TelegramPort | null;
  telegramOwnerChatId?: string;
  telegramTimeoutMs?: number;
}

const getDefaultRateLimitConfig = (): AuthRateLimitConfig => ({
  login: {
    windowMs: getNumberEnvVariable('RATE_LIMIT_LOGIN_WINDOW_MS', 900000),
    max: getNumberEnvVariable('RATE_LIMIT_LOGIN_MAX', 5),
  },
  signup: {
    windowMs: getNumberEnvVariable('RATE_LIMIT_SIGNUP_WINDOW_MS', 3600000),
    max: getNumberEnvVariable('RATE_LIMIT_SIGNUP_MAX', 3),
  },
  forgotPassword: {
    windowMs: getNumberEnvVariable(
      'RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS',
      3600000,
    ),
    max: getNumberEnvVariable('RATE_LIMIT_FORGOT_PASSWORD_MAX', 3),
  },
  refresh: {
    windowMs: getNumberEnvVariable('RATE_LIMIT_REFRESH_WINDOW_MS', 900000),
    max: getNumberEnvVariable('RATE_LIMIT_REFRESH_MAX', 60),
  },
  mfaVerify: {
    windowMs: getNumberEnvVariable('RATE_LIMIT_MFA_VERIFY_WINDOW_MS', 900000),
    max: getNumberEnvVariable('RATE_LIMIT_MFA_VERIFY_MAX', 10),
  },
  sessionRevoke: {
    windowMs: getNumberEnvVariable(
      'RATE_LIMIT_SESSION_REVOKE_WINDOW_MS',
      900000,
    ),
    max: getNumberEnvVariable('RATE_LIMIT_SESSION_REVOKE_MAX', 60),
  },
});

const getDefaultGrantsRateLimitConfig = (): GrantsRateLimitConfig => ({
  membersWrite: {
    windowMs: getNumberEnvVariable(
      'RATE_LIMIT_MEMBERS_WRITE_WINDOW_MS',
      900000,
    ),
    max: getNumberEnvVariable('RATE_LIMIT_MEMBERS_WRITE_MAX', 30),
  },
});

export const resolveAccessTokenTtl = (
  options: ApplicationCompositionOptions = {},
): number =>
  options.jwtExpiresIn ??
  parseInt(getStringEnvVariable('JWT_EXPIRATION', '3600'), 10);

const resolveRefreshTokenTtl = (
  options: ApplicationCompositionOptions = {},
): number =>
  options.refreshTokenExpiresIn ??
  parseInt(
    getStringEnvVariable(
      'JWT_REFRESH_EXPIRATION',
      getStringEnvVariable('JWT_REFRESH_EXPIRES_IN', '86400'),
    ),
    10,
  );

export const createApplicationComposition = (
  options: ApplicationCompositionOptions = {},
): ApplicationComposition => {
  const logger = options.logger ?? new WinstonLogger();
  const auditService = new AuditService(createAuditEventModel(), logger);
  const database =
    options.database ?? new Database(requireEnvVariable('MONGO_URI'), logger);
  const healthModule = new HealthModule(logger, () => database.getReadyState());
  const cryptoService = new CryptoService();
  const mfaSecretKey = getStringEnvVariable('MFA_SECRET_ENCRYPTION_KEY', '');
  const mfaCipher = mfaSecretKey ? new SecretCipher(mfaSecretKey) : null;
  const jwtConfig =
    options.jwtConfig ??
    resolveJwtConfig({
      env: {
        ...process.env,
        ...(options.jwtSecret === undefined
          ? {}
          : { JWT_SECRET: options.jwtSecret }),
        ...(options.jwtIssuer === undefined
          ? {}
          : { JWT_ISSUER: options.jwtIssuer }),
      },
    });
  const jwtService = new JwtService(
    jwtConfig.keyring,
    resolveAccessTokenTtl(options),
    resolveRefreshTokenTtl(options),
    {
      issuer: jwtConfig.issuer,
      ...(jwtConfig.legacySecret === undefined
        ? {}
        : { legacySecret: jwtConfig.legacySecret }),
      mfaChallengeExpiresIn: getNumberEnvVariable(
        'MFA_CHALLENGE_EXPIRATION',
        300,
      ),
      logger,
    },
  );
  if (jwtConfig.ephemeral) {
    logger.warn(
      'JWT keys are ephemeral: tokens and JWKS will differ between instances and restarts',
    );
  }
  const blacklistService = new BlacklistService(BlacklistedTokenModel);
  const authenticationMiddleware = new AuthenticationMiddleware(
    jwtService,
    blacklistService,
  );
  const authorizationMiddleware = new AuthorizationMiddleware();
  const jwksModule = new JwksModule({
    logger,
    getJwks: () => jwtConfig.keyring.getJwks(),
    getKeyStatus: () => jwtConfig.keyring.getStatus(),
    authenticationMiddleware,
    authorizationMiddleware,
  });
  const templateRenderer = new HandlebarsEngine();
  const mailer =
    options.mailer ?? new NodeMailerAdapter(templateRenderer, logger);
  const publicAppUrl =
    options.publicAppUrl ??
    getStringEnvVariable('PUBLIC_APP_URL', 'https://ourservice.com');
  const authMailer = new AuthMailer(
    mailer,
    publicAppUrl,
    getStringEnvVariable('APP_NAME', 'Auth Service'),
  );
  const codeService = new CodesService(
    CodesModel,
    getNumberEnvVariable('CODE_EXPIRATION_MS', 3600000),
    getNumberEnvVariable('CODE_LENGTH', 6),
  );
  const refreshTokenService = new RefreshTokenService(RefreshTokenModel);
  const holdersService = new HoldersService(HoldersModel, cryptoService);
  const applicationsModule = new ApplicationsModule(
    authenticationMiddleware,
    authorizationMiddleware,
    logger,
    auditService,
  );
  const settingsService = new SettingsService(
    applicationsModule.service,
    new GlobalSettingsRepository(),
    applicationsModule.service,
  );
  const usersModule = new UsersModule(
    cryptoService,
    authenticationMiddleware,
    authorizationMiddleware,
    logger,
    options.maxLoginAttempts ?? getNumberEnvVariable('MAX_LOGIN_ATTEMPTS', 5),
    options.lockoutDurationMs ??
      getNumberEnvVariable('LOCKOUT_DURATION_MS', 900000),
    mfaCipher ?? undefined,
    auditService,
    (options.rateLimitConfig ?? getDefaultRateLimitConfig()).login,
    (options.rateLimitConfig ?? getDefaultRateLimitConfig()).sessionRevoke,
  );
  const grantsModule = new GrantsModule(
    GrantModel,
    applicationsModule.service,
    usersModule.service,
    authenticationMiddleware,
    auditService,
    logger,
    options.grantsRateLimit ?? getDefaultGrantsRateLimitConfig(),
  );
  usersModule.service.setGrantsCleaner(grantsModule.service);
  // Single authorization policy shared by the applications, grants and links
  // surfaces; it can only be built once both services exist.
  const applicationAuthorizationMiddleware =
    new ApplicationAuthorizationMiddleware(
      grantsModule.service,
      applicationsModule.service,
    );
  const ownerBootstrap = new OwnerBootstrapService(usersModule.service);
  const telegramConfig =
    options.telegram === undefined ? resolveTelegramConfig() : null;
  const telegram =
    options.telegram !== undefined
      ? options.telegram
      : telegramConfig
        ? new TelegramAdapter({
            botToken: telegramConfig.botToken,
            timeoutMs: telegramConfig.timeoutMs,
          })
        : null;
  const telegramOwnerChatId =
    options.telegramOwnerChatId ?? telegramConfig?.ownerChatId;
  const linkNotifications = new LinkNotificationsService({
    telegram,
    usersService: usersModule.service,
    ...(telegramOwnerChatId === undefined
      ? {}
      : { ownerChatId: telegramOwnerChatId }),
    logger,
    timeoutMs: options.telegramTimeoutMs ?? telegramConfig?.timeoutMs ?? 3000,
  });
  const applicationTokenService = new ApplicationTokenService(
    jwtService,
    applicationsModule.service,
    grantsModule.service,
    usersModule.service,
  );
  const sessionService = new SessionService(
    jwtService,
    refreshTokenService,
    getNumberEnvVariable('MAX_SESSIONS_PER_USER', 50),
  );
  usersModule.service.setSessionRevoker(sessionService);
  usersModule.service.setSessionManager({
    listSessions: (userId) => sessionService.list(userId),
    revokeSession: (userId, sessionId) =>
      sessionService.revoke(userId, sessionId),
    revokeAllSessions: (userId) => sessionService.revokeAllWithIds(userId),
  });
  const mfaService = new MfaService(
    usersModule.service,
    cryptoService,
    sessionService,
    getStringEnvVariable('APP_NAME', 'Auth Service'),
    settingsService,
    applicationsModule.service,
  );
  const authService = new AuthService(
    usersModule.service,
    authMailer,
    codeService,
    sessionService,
    blacklistService,
    holdersService,
    applicationTokenService,
    jwtService,
    auditService,
    mfaService,
    logger,
  );
  const profileService = new ProfileService(
    usersModule.service,
    jwtService,
    blacklistService,
    grantsModule.service,
    applicationsModule.service,
  );
  const linksService = new LinksService(
    LinkModel,
    getNumberEnvVariable('INVITATION_LINK_EXPIRATION_MS', 604800000),
    getNumberEnvVariable('PASSWORD_RESET_LINK_EXPIRATION_MS', 3600000),
  );
  const invitationsService = new InvitationsService(
    linksService,
    usersModule.service,
    holdersService,
    grantsModule.service,
    applicationsModule.service,
    cryptoService,
    publicAppUrl,
    linkNotifications,
    logger,
    authMailer,
    settingsService,
    auditService,
  );
  grantsModule.service.setInvitationsPort(invitationsService);
  const passwordResetLinksService = new PasswordResetLinksService(
    linksService,
    usersModule.service,
    sessionService,
    publicAppUrl,
    linkNotifications,
    logger,
  );
  const linksModule = new LinksModule({
    linksController: new LinksController(
      invitationsService,
      passwordResetLinksService,
    ),
    authenticationMiddleware,
    authorizationMiddleware,
    logger,
  });
  const authModule = new AuthModule({
    authController: new AuthController(authService, profileService, mfaService),
    authenticationMiddleware,
    rateLimitConfig: options.rateLimitConfig ?? getDefaultRateLimitConfig(),
    logger,
  });
  const settingsModule = new SettingsModule({
    settingsService,
    auditService,
    authenticationMiddleware,
    authorizationMiddleware,
    applicationAuthorizationMiddleware,
    logger,
  });
  const configuredExportMax = getNumberEnvVariable(
    'AUDIT_EXPORT_MAX_ROWS',
    10_000,
  );
  const auditExportMaxRows =
    Number.isInteger(configuredExportMax) && configuredExportMax > 0
      ? configuredExportMax
      : 10_000;
  const auditModule = new AuditModule({
    auditController: new AuditController(
      auditService,
      auditExportMaxRows,
      logger,
    ),
    authenticationMiddleware,
    authorizationMiddleware,
    logger,
  });

  return {
    logger,
    database,
    applications: applicationsModule.service,
    grants: grantsModule.service,
    settings: settingsService,
    usersModule,
    authModule,
    linksModule,
    auditModule,
    ownerBootstrap,
    jwtKeyring: jwtConfig.keyring,
    applicationTokens: applicationTokenService,
    initialize(app, requestLogger = logger): void {
      app.set(
        'trust proxy',
        options.trustProxy ??
          resolveTrustProxy(getStringEnvVariable('TRUST_PROXY')),
      );

      const corsOrigins =
        options.corsOrigins === undefined
          ? resolveCorsOrigins(getStringEnvVariable('CORS_ORIGINS'))
          : normalizeCorsOrigins(options.corsOrigins);

      if (corsOrigins.length === 0) {
        requestLogger.warn(
          'CORS_ORIGINS is not configured: every browser origin will be rejected',
        );
      } else {
        requestLogger.info(`CORS allowed origins: ${corsOrigins.join(', ')}`);
      }

      HttpLoggerInterceptor.initialize(app, requestLogger, (request) =>
        isHealthProbe(request.path),
      );
      GlobalMiddlewares.initialize(
        app,
        [
          '/auth/logout',
          ...USER_SUPPORT_BODYLESS_PATHS,
          ...LINKS_BODYLESS_PATHS,
        ],
        corsOrigins,
      );
      healthModule.initialize(app);
      jwksModule.initialize(app);
      applicationsModule.initialize(app, applicationAuthorizationMiddleware);
      grantsModule.initialize(app, applicationAuthorizationMiddleware);
      usersModule.initialize(app);
      authModule.initialize(app);
      linksModule.initialize(app, applicationAuthorizationMiddleware);
      auditModule.initialize(app);
      settingsModule.initialize(app);
      HttpInterceptor.initialize(app, requestLogger);
    },
  };
};
