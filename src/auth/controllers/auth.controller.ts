import { Request, Response } from 'express';

import { Catch } from '../../common/decorators/catch.decorator';
import { InvalidCredentialsError } from '../../common/exceptions/auth.exceptions';
import { InvalidArgumentError } from '../../common/exceptions/base.exception';
import { extractRequestContext } from '../../common/request-context';
import { MfaService } from '../mfa';
import { AuthService } from '../services/auth.service';
import { ProfileService, TokenIdentity } from '../services/profile.service';
import { RequestContext } from '../tokens/request-context.type';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly profileService: ProfileService,
    private readonly mfaService: MfaService,
  ) {}

  private buildRequestContext(req: Request): RequestContext {
    const { ipAddress, userAgent } = extractRequestContext(req);

    return { ipAddress, userAgent };
  }

  private buildIdentity(req: Request): TokenIdentity {
    const user = req.user;

    // authenticateAny always sets both fields; failing with a 401 keeps the
    // status honest if the middleware contract is ever broken.
    if (!user?.expiresAt) {
      throw new InvalidCredentialsError('Authentication required');
    }

    return {
      id: user.id,
      role: user.role,
      ...(user.audience === undefined ? {} : { audience: user.audience }),
      expiresAt: user.expiresAt,
    };
  }

  @Catch()
  async login(req: Request, res: Response): Promise<void> {
    const { email, password, application } = req.body as Record<
      string,
      unknown
    >;

    if (application !== undefined && typeof application !== 'string') {
      throw new InvalidArgumentError('application must be a string');
    }

    const tokens = await this.authService.login(
      {
        email: email as string,
        password: password as string,
        ...(typeof application === 'string' ? { application } : {}),
      },
      this.buildRequestContext(req),
    );

    res.status(200).json(tokens);
  }

  @Catch()
  async verifyMfa(req: Request, res: Response): Promise<void> {
    const { mfaToken, code } = req.body as {
      mfaToken: string;
      code: string;
    };
    const tokens = await this.authService.verifyMfa(
      mfaToken,
      code,
      this.buildRequestContext(req),
    );

    res.status(200).json(tokens);
  }

  @Catch()
  async enrollMfa(req: Request, res: Response): Promise<void> {
    const { password } = req.body as { password: string };
    const enrollment = await this.mfaService.enroll(
      req.user?.id as string,
      password,
    );

    res.status(200).json(enrollment);
  }

  @Catch()
  async activateMfa(req: Request, res: Response): Promise<void> {
    const { code } = req.body as { code: string };
    const activation = await this.mfaService.activate(
      req.user?.id as string,
      code,
    );

    res.status(200).json(activation);
  }

  @Catch()
  async disableMfa(req: Request, res: Response): Promise<void> {
    const { password, code } = req.body as {
      password: string;
      code: string;
    };
    await this.mfaService.disable(req.user?.id as string, password, code);

    res.status(204).send();
  }

  @Catch()
  async signup(req: Request, res: Response): Promise<void> {
    const credentials = req.body;
    const newUser = await this.authService.signup(credentials);

    res.status(201).json(newUser);
  }

  @Catch()
  async refreshToken(req: Request, res: Response): Promise<void> {
    const refreshToken = req.body.refreshToken;
    const tokens = await this.authService.refreshToken(
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
  async me(req: Request, res: Response): Promise<void> {
    const profile = await this.profileService.getProfile(
      this.buildIdentity(req),
    );

    res.status(200).json(profile);
  }

  @Catch()
  async context(req: Request, res: Response): Promise<void> {
    const context = await this.profileService.getContext(
      this.buildIdentity(req),
    );

    res.status(200).json(context);
  }

  @Catch()
  async introspect(req: Request, res: Response): Promise<void> {
    const { token } = req.body as { token?: unknown };

    if (typeof token !== 'string' || !token) {
      throw new InvalidArgumentError('token is required');
    }

    const result = await this.profileService.introspect(
      token,
      this.buildIdentity(req),
    );

    res.status(200).json(result);
  }

  @Catch()
  async listSessions(req: Request, res: Response): Promise<void> {
    const sessions = await this.authService.listSessions(
      req.user?.id as string,
    );

    res.status(200).json(sessions);
  }

  @Catch()
  async revokeSession(req: Request, res: Response): Promise<void> {
    await this.authService.revokeSession(
      req.user?.id as string,
      req.params.sessionId as string,
      this.buildRequestContext(req),
    );

    res.status(204).send();
  }

  @Catch()
  async revokeAllSessions(req: Request, res: Response): Promise<void> {
    await this.authService.revokeAllSessions(
      req.user?.id as string,
      this.buildRequestContext(req),
    );

    res.status(204).send();
  }

  @Catch()
  async logout(req: Request, res: Response): Promise<void> {
    const userId = req.user?.id as string;
    const jti = req.user?.jti;
    const expiresAt = req.user?.expiresAt;
    await this.authService.logout(
      userId,
      jti,
      expiresAt,
      req.user?.audience,
      this.buildRequestContext(req),
    );

    res.status(204).send();
  }
}
