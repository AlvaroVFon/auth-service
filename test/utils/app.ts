import express, { Application } from 'express';

import { createApplicationComposition } from '../../src/config/application.composition';
import {
  getNumberEnvVariable,
  getStringEnvVariable,
} from '../../src/config/env.config';
import { MailerInterface } from '../../src/libs/mailer/mailer.interface';
import { silentLogger } from '../mocks/logger.mock';

let app: Application;

const mailer = {
  sendEmail: mock.fn(() => Promise.resolve()),
  sendMailWithTemplate: mock.fn(() => Promise.resolve()),
} as MailerInterface;

const composition = createApplicationComposition({
  logger: silentLogger,
  mailer,
  jwtSecret: getStringEnvVariable('JWT_SECRET'),
  jwtExpiresIn: parseInt(getStringEnvVariable('JWT_EXPIRATION', '3600'), 10),
  refreshTokenExpiresIn: parseInt(
    getStringEnvVariable('JWT_REFRESH_EXPIRES_IN', '86400'),
    10,
  ),
  maxLoginAttempts: 5,
  lockoutDurationMs: 900000,
  rateLimitConfig: {
    login: {
      windowMs: getNumberEnvVariable('RATE_LIMIT_LOGIN_WINDOW_MS', 5000),
      max: getNumberEnvVariable('RATE_LIMIT_LOGIN_MAX', 2),
    },
    signup: {
      windowMs: getNumberEnvVariable('RATE_LIMIT_SIGNUP_WINDOW_MS', 5000),
      max: getNumberEnvVariable('RATE_LIMIT_SIGNUP_MAX', 2),
    },
    forgotPassword: {
      windowMs: getNumberEnvVariable(
        'RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS',
        5000,
      ),
      max: getNumberEnvVariable('RATE_LIMIT_FORGOT_PASSWORD_MAX', 2),
    },
  },
});

export const createAppTestInstance = async () => {
  app = express();
  app.set('trust proxy', 1);
  composition.initialize(app);

  return app;
};

export const getTestAppInstance = async () => {
  if (!app) {
    await createAppTestInstance();
  }
  return app;
};
