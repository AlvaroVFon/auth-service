import { Request, Response } from 'express';

import { resolveGlobalActorRole } from '../common/actor-role';
import { Catch } from '../common/decorators/catch.decorator';
import { GrantRoles } from '../grants';
import { InvitationsService } from './invitations.service';
import { PasswordResetLinksService } from './password-reset-links.service';

export class LinksController {
  constructor(
    private readonly invitationsService: InvitationsService,
    private readonly passwordResetLinksService: PasswordResetLinksService,
  ) {}

  @Catch()
  async createInvitation(req: Request, res: Response): Promise<void> {
    const { email, role, telegramChatId } = req.body as {
      email: string;
      role: GrantRoles;
      telegramChatId?: string;
    };
    const user = req.user;
    const actorRole = resolveGlobalActorRole(user);

    const result = await this.invitationsService.create({
      email,
      applicationId: req.params.applicationId as string,
      role,
      ...(actorRole === undefined ? {} : { actorRole }),
      ...(telegramChatId === undefined ? {} : { telegramChatId }),
    });

    res.status(201).json(result);
  }

  @Catch()
  async acceptInvitation(req: Request, res: Response): Promise<void> {
    const { token, password, passwordConfirmation } = req.body as {
      token: string;
      password: string;
      passwordConfirmation: string;
    };

    await this.invitationsService.accept({
      token,
      password,
      passwordConfirmation,
    });

    res.status(204).send();
  }

  @Catch()
  async createPasswordResetLink(req: Request, res: Response): Promise<void> {
    const { userId } = req.body as { userId: string };
    const result = await this.passwordResetLinksService.create(userId);

    res.status(201).json(result);
  }

  @Catch()
  async acceptPasswordResetLink(req: Request, res: Response): Promise<void> {
    const { token, newPassword, passwordConfirmation } = req.body as {
      token: string;
      newPassword: string;
      passwordConfirmation: string;
    };

    await this.passwordResetLinksService.accept({
      token,
      newPassword,
      passwordConfirmation,
    });

    res.status(204).send();
  }
}
