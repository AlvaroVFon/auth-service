import { Application } from 'express';
import { AuthController } from './auth.controller';

export class AuthRouter {
  constructor(
    private readonly authController: AuthController,
    private readonly app: Application,
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
  }
}
