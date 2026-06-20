import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { Catch } from '../../common/decorators/catch.decorator';
import { RequestContext } from '../tokens/request-context.type';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private buildRequestContext(req: Request): RequestContext {
    return {
      ipAddress: req.ip ?? undefined,
      userAgent: req.get('User-Agent') ?? undefined,
    };
  }

  @Catch()
  async login(req: Request, res: Response): Promise<void> {
    const credentials = req.body;
    const tokens = await this.authService.login(
      credentials,
      this.buildRequestContext(req),
    );

    res.status(200).json(tokens);
  }

  @Catch()
  async signup(req: Request, res: Response): Promise<void> {
    const credentials = req.body;
    const newUser = await this.authService.signup(credentials);

    res.status(201).json(newUser);
  }

  @Catch()
  async refreshToken(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id as string;
    const refreshToken = req.body.refreshToken;
    const tokens = await this.authService.refreshToken(
      userId,
      refreshToken,
      this.buildRequestContext(req),
    );

    res.status(200).json(tokens);
  }

  @Catch()
  async verifyEmail(req: Request, res: Response): Promise<void> {
    const holderId = req.query.holderId as string;
    const { code } = req.body;
    await this.authService.validateSignupVerificationCode(holderId, code);

    res.status(204).send();
  }

  @Catch()
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = req.body;
    await this.authService.forgotPassword(email);

    res.status(204).send();
  }

  @Catch()
  async resetPassword(req: Request, res: Response): Promise<void> {
    const { userId, code, newPassword, passwordConfirmation } = req.body;

    await this.authService.resetPassword(
      userId,
      code,
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
