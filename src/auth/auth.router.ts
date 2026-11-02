import { Application } from 'express';

import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { createRateLimiter } from '../common/middlewares/rate-limiter.middleware';
import { AuthController } from './controllers/auth.controller';

export interface AuthRateLimitConfig {
  login: {
    windowMs: number;
    max: number;
  };
  signup: {
    windowMs: number;
    max: number;
  };
  forgotPassword: {
    windowMs: number;
    max: number;
  };
  refresh: {
    windowMs: number;
    max: number;
  };
  mfaVerify: {
    windowMs: number;
    max: number;
  };
}

export class AuthRouter {
  constructor(
    private readonly authController: AuthController,
    private readonly app: Application,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
    private readonly rateLimitConfig: AuthRateLimitConfig,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    const loginRateLimiter = createRateLimiter(
      this.rateLimitConfig.login.windowMs,
      this.rateLimitConfig.login.max,
    );
    const signupRateLimiter = createRateLimiter(
      this.rateLimitConfig.signup.windowMs,
      this.rateLimitConfig.signup.max,
    );
    const forgotPasswordRateLimiter = createRateLimiter(
      this.rateLimitConfig.forgotPassword.windowMs,
      this.rateLimitConfig.forgotPassword.max,
    );
    const refreshRateLimiter = createRateLimiter(
      this.rateLimitConfig.refresh.windowMs,
      this.rateLimitConfig.refresh.max,
    );
    const mfaVerifyRateLimiter = createRateLimiter(
      this.rateLimitConfig.mfaVerify.windowMs,
      this.rateLimitConfig.mfaVerify.max,
    );

    this.app.post(
      '/auth/login',
      loginRateLimiter,
      this.authController.login.bind(this.authController),
    );

    this.app.post(
      '/auth/signup',
      signupRateLimiter,
      this.authController.signup.bind(this.authController),
    );

    this.app.post(
      '/auth/refresh',
      refreshRateLimiter,
      this.authController.refreshToken.bind(this.authController),
    );

    this.app.post(
      '/auth/verify',
      this.authController.verifyEmail.bind(this.authController),
    );

    this.app.post(
      '/auth/forgot-password',
      forgotPasswordRateLimiter,
      this.authController.forgotPassword.bind(this.authController),
    );

    this.app.post(
      '/auth/reset-password',
      this.authController.resetPassword.bind(this.authController),
    );

    this.app.post(
      '/auth/logout',
      this.authenticationMiddleware.authenticateAny,
      this.authController.logout.bind(this.authController),
    );

    this.app.post(
      '/auth/mfa/verify',
      mfaVerifyRateLimiter,
      this.authController.verifyMfa.bind(this.authController),
    );

    this.app.post(
      '/auth/mfa/enroll',
      loginRateLimiter,
      this.authenticationMiddleware.authenticateAny,
      this.authController.enrollMfa.bind(this.authController),
    );

    this.app.post(
      '/auth/mfa/activate',
      this.authenticationMiddleware.authenticateAny,
      this.authController.activateMfa.bind(this.authController),
    );

    this.app.post(
      '/auth/mfa/disable',
      loginRateLimiter,
      this.authenticationMiddleware.authenticateAny,
      this.authController.disableMfa.bind(this.authController),
    );

    this.app.get(
      '/auth/sessions',
      this.authenticationMiddleware.authenticateAny,
      this.authController.listSessions.bind(this.authController),
    );

    this.app.delete(
      '/auth/sessions/:sessionId',
      this.authenticationMiddleware.authenticateAny,
      this.authController.revokeSession.bind(this.authController),
    );

    this.app.delete(
      '/auth/sessions',
      this.authenticationMiddleware.authenticateAny,
      this.authController.revokeAllSessions.bind(this.authController),
    );

    this.app.get(
      '/auth/me',
      this.authenticationMiddleware.authenticateAny,
      this.authController.me.bind(this.authController),
    );

    this.app.post(
      '/auth/introspect',
      this.authenticationMiddleware.authenticateAny,
      this.authController.introspect.bind(this.authController),
    );
  }
}
