import { Application } from 'express';
import { AuthController } from './controllers/auth.controller';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { AuthTenantController } from './controllers/auth.tenant.controller';
import { createRateLimiter } from '../common/middlewares/rate-limiter.middleware';

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
}

export class AuthRouter {
  constructor(
    private readonly authController: AuthController,
    private readonly authTenantController: AuthTenantController,
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
      this.authenticationMiddleware.authenticate,
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
      this.authenticationMiddleware.authenticate,
      this.authController.logout.bind(this.authController),
    );

    this.app.post(
      '/auth/tenant/login',
      this.authTenantController.login.bind(this.authTenantController),
    );
  }
}
