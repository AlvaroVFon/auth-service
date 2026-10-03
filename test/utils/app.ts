import express, { Application } from 'express';

import { AuthModule } from '../../src/auth/auth.module';
import { CodesModel } from '../../src/auth/codes/codes.schema';
import { CodesService } from '../../src/auth/codes/codes.service';
import { AuthTenantService } from '../../src/auth/services/auth-tenant.service';
import { BlacklistService } from '../../src/auth/tokens/blacklist.service';
import { BlacklistedTokenModel } from '../../src/auth/tokens/blacklisted-token.schema';
import { RefreshTokenModel } from '../../src/auth/tokens/refresh-token.schema';
import { RefreshTokenService } from '../../src/auth/tokens/refresh-token.service';
import { HttpInterceptor } from '../../src/common/interceptors/exception.interceptor';
import { HttpLoggerInterceptor } from '../../src/common/interceptors/httplogger.interceptor';
import { AuthenticationMiddleware } from '../../src/common/middlewares/authentication.middleware';
import { AuthorizationMiddleware } from '../../src/common/middlewares/authorization.middleware';
import {
  getNumberEnvVariable,
  getStringEnvVariable,
} from '../../src/config/env.config';
import { GlobalMiddlewares } from '../../src/config/middlewares.config';
import { HoldersModel } from '../../src/holders/holders.schema';
import { HoldersService } from '../../src/holders/holders.service';
import { CryptoService } from '../../src/libs/crypto/crypto.service';
import { JwtService } from '../../src/libs/jwt/jwt.service';
import { MailerInterface } from '../../src/libs/mailer/mailer.interface';
import { TenantsModel } from '../../src/tenants/tenants.schema';
import { TenantsService } from '../../src/tenants/tenants.service';
import { UsersModule } from '../../src/users/users.module';
import { silentLogger } from '../mocks/logger.mock';

let app: Application;

const JWT_SECRET = getStringEnvVariable('JWT_SECRET');
const JWT_EXPIRES_IN = parseInt(
  getStringEnvVariable('JWT_EXPIRES_IN', '3600'),
  10,
);
const JWT_REFRESH_EXPIRES_IN = parseInt(
  getStringEnvVariable('JWT_REFRESH_EXPIRES_IN', '86400'),
  10,
);

const RATE_LIMIT_LOGIN_WINDOW_MS = getNumberEnvVariable(
  'RATE_LIMIT_LOGIN_WINDOW_MS',
  5000,
);
const RATE_LIMIT_LOGIN_MAX = getNumberEnvVariable('RATE_LIMIT_LOGIN_MAX', 2);
const RATE_LIMIT_SIGNUP_WINDOW_MS = getNumberEnvVariable(
  'RATE_LIMIT_SIGNUP_WINDOW_MS',
  5000,
);
const RATE_LIMIT_SIGNUP_MAX = getNumberEnvVariable('RATE_LIMIT_SIGNUP_MAX', 2);
const RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS = getNumberEnvVariable(
  'RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS',
  5000,
);
const RATE_LIMIT_FORGOT_PASSWORD_MAX = getNumberEnvVariable(
  'RATE_LIMIT_FORGOT_PASSWORD_MAX',
  2,
);

const logger = silentLogger;
const cryptoService = new CryptoService();
const jwtService = new JwtService(
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
);
const blacklistService = new BlacklistService(BlacklistedTokenModel);
const authenticationMiddleware = new AuthenticationMiddleware(
  jwtService,
  blacklistService,
);
const authorizationMiddleware = new AuthorizationMiddleware();
const mailService = {
  sendSignupVerificationEmail: mock.fn(() => Promise.resolve()),
  sendResetPasswordEmail: mock.fn(() => Promise.resolve()),
} as MailerInterface;
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
);

const authModule = new AuthModule(
  usersModule.service,
  cryptoService,
  jwtService,
  logger,
  mailService,
  codeService,
  authenticationMiddleware,
  refreshTokenService,
  blacklistService,
  holdersService,
  authTenantService,
  5,
  900000,
  {
    login: {
      windowMs: RATE_LIMIT_LOGIN_WINDOW_MS,
      max: RATE_LIMIT_LOGIN_MAX,
    },
    signup: {
      windowMs: RATE_LIMIT_SIGNUP_WINDOW_MS,
      max: RATE_LIMIT_SIGNUP_MAX,
    },
    forgotPassword: {
      windowMs: RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS,
      max: RATE_LIMIT_FORGOT_PASSWORD_MAX,
    },
  },
);

export const createAppTestInstance = async () => {
  app = express();
  app.set('trust proxy', 1);

  HttpLoggerInterceptor.initialize(app, logger);
  GlobalMiddlewares.initialize(app);

  usersModule.initialize(app);
  authModule.initialize(app);

  HttpInterceptor.initialize(app, logger);

  return app;
};

export const getTestAppInstance = async () => {
  if (!app) {
    await createAppTestInstance();
  }
  return app;
};
