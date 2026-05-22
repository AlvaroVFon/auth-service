import { Application } from 'express';
import { AuthController } from './controllers/auth.controller';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';
import { AuthTenantController } from './controllers/auth.tenant.controller';

export class AuthRouter {
  constructor(
    private readonly authController: AuthController,
    private readonly authTenantController: AuthTenantController,
    private readonly app: Application,
    private readonly authenticationMiddleware: AuthenticationMiddleware,
  ) {
    this.initializeRoutes();
  }

  private initializeRoutes() {
    this.app.post(
      '/auth/login',
      this.authController.login.bind(this.authController),
    );

    this.app.post(
      '/auth/signup',
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
