import { Application } from 'express';

import { AuthModule } from '../auth';
import type { AuthRateLimitConfig } from '../auth';
import { CodesModel } from '../auth/codes/codes.schema';
import { CodesService } from '../auth/codes/codes.service';
import { AuthTenantService } from '../auth/services/auth-tenant.service';
import { BlacklistService } from '../auth/tokens/blacklist.service';
import { BlacklistedTokenModel } from '../auth/tokens/blacklisted-token.schema';
import { RefreshTokenModel } from '../auth/tokens/refresh-token.schema';
import { RefreshTokenService } from '../auth/tokens/refresh-token.service';
import { HttpInterceptor } from '../common/interceptors/exception.interceptor';
import { HttpLoggerInterceptor } from '../common/interceptors/httplogger.interceptor';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { AuthorizationMiddleware } from '../common/middlewares/authorization.middleware';
import { HoldersModel } from '../holders/holders.schema';
import { HoldersService } from '../holders/holders.service';
import { CryptoService } from '../libs/crypto/crypto.service';
import { JwtService } from '../libs/jwt/jwt.service';
import { WinstonLogger } from '../libs/logger/adapters/winston.logger';
import { LoggerInterface } from '../libs/logger/logger.interface';
import { NodeMailerAdapter } from '../libs/mailer/adapters/nodemailer.adapter';
import { MailerInterface } from '../libs/mailer/mailer.interface';
import { HandlebarsEngine } from '../libs/templates-engine/adapters/handlebars.adapter';
import { TenantsModel } from '../tenants/tenants.schema';
import { TenantsService } from '../tenants/tenants.service';
import { UsersModule } from '../users/users.module';
import { Database } from './database.config';
import { getNumberEnvVariable, getStringEnvVariable } from './env.config';
import { GlobalMiddlewares } from './middlewares.config';

export interface ApplicationComposition {
  readonly logger: LoggerInterface;
  readonly database: Database;
  readonly usersModule: UsersModule;
  readonly authModule: AuthModule;
  initialize(app: Application, logger?: LoggerInterface): void;
}

export interface ApplicationCompositionOptions {
  logger?: LoggerInterface;
  mailer?: MailerInterface;
  database?: Database;
  jwtSecret?: string;
  jwtExpiresIn?: number;
  refreshTokenExpiresIn?: number;
  maxLoginAttempts?: number;
  lockoutDurationMs?: number;
  publicAppUrl?: string;
  rateLimitConfig?: AuthRateLimitConfig;
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

export const createApplicationComposition = (
  options: ApplicationCompositionOptions = {},
): ApplicationComposition => {
  const logger = options.logger ?? new WinstonLogger();
  const database =
    options.database ?? new Database(getStringEnvVariable('MONGO_URI'), logger);
  const cryptoService = new CryptoService();
  const jwtService = new JwtService(
    options.jwtSecret ?? getStringEnvVariable('JWT_SECRET'),
    options.jwtExpiresIn ??
      parseInt(getStringEnvVariable('JWT_EXPIRATION', '3600'), 10),
    options.refreshTokenExpiresIn ??
      parseInt(
        getStringEnvVariable(
          'JWT_REFRESH_EXPIRATION',
          getStringEnvVariable('JWT_REFRESH_EXPIRES_IN', '86400'),
        ),
        10,
      ),
  );
  const blacklistService = new BlacklistService(BlacklistedTokenModel);
  const authenticationMiddleware = new AuthenticationMiddleware(
    jwtService,
    blacklistService,
  );
  const authorizationMiddleware = new AuthorizationMiddleware();
  const templateRenderer = new HandlebarsEngine();
  const mailer =
    options.mailer ?? new NodeMailerAdapter(templateRenderer, logger);
  const codeService = new CodesService(CodesModel);
  const refreshTokenService = new RefreshTokenService(RefreshTokenModel);
  const holdersService = new HoldersService(HoldersModel, cryptoService);
  const tenantsService = new TenantsService(TenantsModel);
  const authTenantService = new AuthTenantService(tenantsService, jwtService);
  const usersModule = new UsersModule(
    cryptoService,
    authenticationMiddleware,
    authorizationMiddleware,
    logger,
    options.maxLoginAttempts ?? getNumberEnvVariable('MAX_LOGIN_ATTEMPTS', 5),
    options.lockoutDurationMs ??
      getNumberEnvVariable('LOCKOUT_DURATION_MS', 900000),
  );
  const authModule = new AuthModule(
    usersModule.service,
    jwtService,
    logger,
    mailer,
    codeService,
    authenticationMiddleware,
    refreshTokenService,
    blacklistService,
    holdersService,
    authTenantService,
    options.rateLimitConfig ?? getDefaultRateLimitConfig(),
    options.publicAppUrl ??
      getStringEnvVariable('PUBLIC_APP_URL', 'https://ourservice.com'),
  );

  return {
    logger,
    database,
    usersModule,
    authModule,
    initialize(app, requestLogger = logger): void {
      HttpLoggerInterceptor.initialize(app, requestLogger);
      GlobalMiddlewares.initialize(app);
      usersModule.initialize(app);
      authModule.initialize(app);
      HttpInterceptor.initialize(app, requestLogger);
    },
  };
};
