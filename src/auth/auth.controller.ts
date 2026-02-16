import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Catch } from '../common/decorators/catch.decorator';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Catch()
  async login(req: Request, res: Response): Promise<void> {
    const credentials = req.body;
    const tokens = await this.authService.login(credentials);

    res.status(200).json(tokens);
  }

  @Catch()
  async signup(req: Request, res: Response): Promise<void> {
    const credentials = req.body;
    const newUser = await this.authService.signup(credentials);

    res.status(201).json(newUser);
  }

  @Catch()
  async verifyEmail(req: Request, res: Response): Promise<void> {
    const holderId = req.query.holderId as string;
    const { code } = req.body;
    await this.authService.validateSignupVerificationCode(holderId, code);

    res.status(204).send();
  }

  @Catch()
  async resetPassword(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id as string;
    const newPassword = req.body.newPassword;
    const passwordConfirmation = req.body.passwordConfirmation;

    await this.authService.resetPassword(
      userId,
      newPassword,
      passwordConfirmation,
    );

    res.status(204).send();
  }

  @Catch()
  async logout(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id as string;
    await this.authService.logout(userId);

    res.status(204).send();
  }
}
