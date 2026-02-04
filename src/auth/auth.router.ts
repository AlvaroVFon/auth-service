import { Application } from 'express';
import { AuthController } from './auth.controller';
import { AuthenticationMiddleware } from '../common/middlewares/authentication.middleware';

export class AuthRouter {
  constructor(
    private readonly authController: AuthController,
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
      '/auth/verify',
      this.authController.verifyEmail.bind(this.authController),
    );

    this.app.post(
      '/auth/reset-password',
      this.authenticationMiddleware.authenticate,
      this.authController.resetPassword.bind(this.authController),
    );
  }
}
