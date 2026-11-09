import { Request, Response } from 'express';

import { resolveGlobalActorRole } from '../common/actor-role';
import { Catch } from '../common/decorators/catch.decorator';
import { Roles } from '../common/enums/roles.enum';
import { EntityNotFoundError } from '../common/exceptions/base.exception';
import type { GrantRoles } from './grants.interface';
import type { GrantApplicationScope } from './grants.port';
import { GrantsService } from './grants.service';

export class GrantsController {
  constructor(private readonly grantsService: GrantsService) {}

  @Catch()
  async createMember(req: Request, res: Response): Promise<void> {
    const { email, role } = req.body as {
      email: string;
      role: GrantRoles;
    };
    const user = req.user;
    const actorRole = resolveGlobalActorRole(user);

    const member = await this.grantsService.grantMemberByEmail({
      email,
      applicationId: req.params.applicationId as string,
      role,
      ...(actorRole === undefined ? {} : { actorRole }),
      ...(user?.id === undefined ? {} : { actorId: user.id }),
    });

    res.status(201).json(member);
  }

  @Catch()
  async upsert(req: Request, res: Response): Promise<void> {
    const applicationId = req.params.applicationId as string;
    const { userId, role } = req.body ?? {};
    const grant = await this.grantsService.assignRole(
      {
        userId,
        applicationId,
        role,
        ...(req.user?.id === undefined ? {} : { actorId: req.user.id }),
      },
      this.scopeFor(req),
    );

    res.status(200).json(grant);
  }

  @Catch()
  async list(req: Request, res: Response): Promise<void> {
    const applicationId = req.params.applicationId as string;
    const grants = await this.grantsService.listByApplication(
      applicationId,
      this.scopeFor(req),
    );

    res.status(200).json(grants);
  }

  @Catch()
  async getOne(req: Request, res: Response): Promise<void> {
    const applicationId = req.params.applicationId as string;
    const userId = req.params.userId as string;
    const grant = await this.grantsService.findByUserAndApplication(
      userId,
      applicationId,
      this.scopeFor(req),
    );

    if (!grant) {
      throw new EntityNotFoundError('Grant not found');
    }

    res.status(200).json(grant);
  }

  @Catch()
  async revoke(req: Request, res: Response): Promise<void> {
    const applicationId = req.params.applicationId as string;
    const userId = req.params.userId as string;
    await this.grantsService.revokeRole(userId, applicationId, req.user?.id);

    res.status(204).json();
  }

  /**
   * Archiving keeps every grant, so the owner must keep administering them
   * afterwards. An app admin never sets this scope: the authorization
   * middleware already rejects it on an inactive application with `403`.
   */
  private scopeFor(req: Request): GrantApplicationScope {
    return req.user?.role === Roles.OWNER ? { includeArchived: true } : {};
  }
}
