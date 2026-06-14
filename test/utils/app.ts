import express, { Application } from 'express';
import { GlobalMiddlewares } from '../../src/config/middlewares.config';
import { UsersModule } from '../../src/users/users.module';
import { HttpInterceptor } from '../../src/common/interceptors/exception.interceptor';
import { HttpLoggerInterceptor } from '../../src/common/interceptors/httplogger.interceptor';
import { WinstonLogger } from '../../src/libs/logger/adapters/winston.logger';
import { CryptoService } from '../../src/libs/crypto/crypto.service';
import {
  getNumberEnvVariable,
  getStringEnvVariable,
} from '../../src/config/env.config';
import { JwtService } from '../../src/libs/jwt/jwt.service';
import { AuthModule } from '../../src/auth/auth.module';
import { AuthenticationMiddleware } from '../../src/common/middlewares/authentication.middleware';
import { AuthorizationMiddleware } from '../../src/common/middlewares/authorization.middleware';
import { MailerInterface } from '../../src/libs/mailer/mailer.interface';
import { CodesService } from '../../src/auth/codes/codes.service';
import { CodesModel } from '../../src/auth/codes/codes.schema';
import { RefreshTokenService } from '../../src/auth/tokens/refresh-token.service';
import { RefreshTokenModel } from '../../src/auth/tokens/refresh-token.schema';
import { HoldersModel } from '../../src/holders/holders.schema';
import { HoldersService } from '../../src/holders/holders.service';
import { TenantsService } from '../../src/tenants/tenants.service';
import { TenantsModel } from '../../src/tenants/tenants.schema';
import { AuthTenantService } from '../../src/auth/services/auth-tenant.service';

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

const winstonLogger = new WinstonLogger();
const cryptoService = new CryptoService();
const jwtService = new JwtService(
  JWT_SECRET,
  JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN,
);
const authenticationMiddleware = new AuthenticationMiddleware(jwtService);
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
  winstonLogger,
);

const authModule = new AuthModule(
  usersModule.service,
  cryptoService,
  jwtService,
  winstonLogger,
  mailService,
  codeService,
  authenticationMiddleware,
  refreshTokenService,
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

  HttpLoggerInterceptor.initialize(app, winstonLogger);
  GlobalMiddlewares.initialize(app);

  usersModule.initialize(app);
  authModule.initialize(app);

  HttpInterceptor.initialize(app, winstonLogger);

  return app;
};

export const getTestAppInstance = async () => {
  if (!app) {
    await createAppTestInstance();
  }
  return app;
};
