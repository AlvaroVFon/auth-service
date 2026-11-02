import { Application } from 'express';

import type { ApplicationsPort } from '../applications';
import { ApplicationModel } from '../applications/applications.schema';
import { ApplicationsService } from '../applications/applications.service';
import { AuthModule } from '../auth';
import type { AuthRateLimitConfig } from '../auth';
import { CodesModel } from '../auth/codes/codes.schema';
import { CodesService } from '../auth/codes/codes.service';
import { AuthController } from '../auth/controllers/auth.controller';
import { AuthMailer } from '../auth/services/auth-mailer';
import { AuthService } from '../auth/services/auth.service';
import { ApplicationTokenService } from '../auth/tokens/application-token.service';
import { BlacklistService } from '../auth/tokens/blacklist.service';
import { BlacklistedTokenModel } from '../auth/tokens/blacklisted-token.schema';
import { RefreshTokenModel } from '../auth/tokens/refresh-token.schema';
import { RefreshTokenService } from '../auth/tokens/refresh-token.service';
import { SessionService } from '../auth/tokens/session.service';
import { HttpInterceptor } from '../common/interceptors/exception.interceptor';
import { HttpLoggerInterceptor } from '../common/interceptors/httplogger.interceptor';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import type { GrantsPort } from '../grants';
import { GrantModel } from '../grants/grants.schema';
import { GrantsService } from '../grants/grants.service';
import { HealthModule, isHealthProbe } from '../health';
import { HoldersModel } from '../holders/holders.schema';
import { HoldersService } from '../holders/holders.service';
import { JwksModule } from '../jwks';
import { CryptoService } from '../libs/crypto/crypto.service';
import { JwtKeyring } from '../libs/jwt';
import { JwtService } from '../libs/jwt/jwt.service';
import { WinstonLogger } from '../libs/logger/adapters/winston.logger';
import { LoggerInterface } from '../libs/logger/logger.interface';
import { NodeMailerAdapter } from '../libs/mailer/adapters/nodemailer.adapter';
import { MailerInterface } from '../libs/mailer/mailer.interface';
import { HandlebarsEngine } from '../libs/templates-engine/adapters/handlebars.adapter';
import { UsersModule } from '../users/users.module';
import { normalizeCorsOrigins, resolveCorsOrigins } from './cors.config';
import { Database } from './database.config';
import { getNumberEnvVariable, getStringEnvVariable } from './env.config';
import { JwtConfig, resolveJwtConfig } from './jwt.config';
import { GlobalMiddlewares } from './middlewares.config';
import { resolveTrustProxy } from './trust-proxy.config';

export interface ApplicationComposition {
  readonly logger: LoggerInterface;
  readonly database: Database;
  readonly applications: ApplicationsPort;
  readonly grants: GrantsPort;
  readonly usersModule: UsersModule;
  readonly authModule: AuthModule;
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
  corsOrigins?: string[];
  trustProxy?: boolean | number;
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
  const database =
    options.database ?? new Database(getStringEnvVariable('MONGO_URI'), logger);
  const healthModule = new HealthModule(logger, () => database.getReadyState());
  const cryptoService = new CryptoService();
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
      logger,
    },
  );
  if (jwtConfig.ephemeral) {
    logger.warn(
      'JWT keys are ephemeral: tokens and JWKS will differ between instances and restarts',
    );
  }
  const jwksModule = new JwksModule(logger, () => jwtConfig.keyring.getJwks());
  const blacklistService = new BlacklistService(BlacklistedTokenModel);
  const authenticationMiddleware = new AuthenticationMiddleware(
    jwtService,
    blacklistService,
  );
  const authorizationMiddleware = new AuthorizationMiddleware();
  const templateRenderer = new HandlebarsEngine();
  const mailer =
    options.mailer ?? new NodeMailerAdapter(templateRenderer, logger);
  const authMailer = new AuthMailer(
    mailer,
    options.publicAppUrl ??
      getStringEnvVariable('PUBLIC_APP_URL', 'https://ourservice.com'),
    getStringEnvVariable('APP_NAME', 'Auth Service'),
  );
  const codeService = new CodesService(
    CodesModel,
    getNumberEnvVariable('CODE_EXPIRATION_MS', 3600000),
    getNumberEnvVariable('CODE_LENGTH', 6),
  );
  const refreshTokenService = new RefreshTokenService(RefreshTokenModel);
  const holdersService = new HoldersService(HoldersModel, cryptoService);
  const applicationsService = new ApplicationsService(ApplicationModel);
  const usersModule = new UsersModule(
    cryptoService,
    authenticationMiddleware,
    authorizationMiddleware,
    logger,
    options.maxLoginAttempts ?? getNumberEnvVariable('MAX_LOGIN_ATTEMPTS', 5),
    options.lockoutDurationMs ??
      getNumberEnvVariable('LOCKOUT_DURATION_MS', 900000),
  );
  const grantsService = new GrantsService(
    GrantModel,
    applicationsService,
    usersModule.service,
  );
  const applicationTokenService = new ApplicationTokenService(
    jwtService,
    applicationsService,
    grantsService,
    usersModule.service,
  );
  const sessionService = new SessionService(jwtService, refreshTokenService);
  const authService = new AuthService(
    usersModule.service,
    authMailer,
    codeService,
    sessionService,
    blacklistService,
    holdersService,
    logger,
  );
  const authModule = new AuthModule({
    authController: new AuthController(authService),
    authenticationMiddleware,
    rateLimitConfig: options.rateLimitConfig ?? getDefaultRateLimitConfig(),
    logger,
  });

  return {
    logger,
    database,
    applications: applicationsService,
    grants: grantsService,
    usersModule,
    authModule,
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
      GlobalMiddlewares.initialize(app, ['/auth/logout'], corsOrigins);
      healthModule.initialize(app);
      jwksModule.initialize(app);
      usersModule.initialize(app);
      authModule.initialize(app);
      HttpInterceptor.initialize(app, requestLogger);
    },
  };
};
