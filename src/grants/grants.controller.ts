import { Request, Response } from 'express';

import { Catch } from '../common/decorators/catch.decorator';
import { EntityNotFoundError } from '../common/exceptions/base.exception';
import { GrantsService } from './grants.service';

export class GrantsController {
  constructor(private readonly grantsService: GrantsService) {}

  @Catch()
  async upsert(req: Request, res: Response): Promise<void> {
    const applicationId = req.params.applicationId as string;
    const { userId, role } = req.body ?? {};
    const grant = await this.grantsService.assignRole({
      userId,
      applicationId,
      role,
      ...(req.user?.id === undefined ? {} : { actorId: req.user.id }),
    });

    res.status(200).json(grant);
  }

  @Catch()
  async list(req: Request, res: Response): Promise<void> {
    const applicationId = req.params.applicationId as string;
    const grants = await this.grantsService.listByApplication(applicationId);

    res.status(200).json(grants);
  }

  @Catch()
  async getOne(req: Request, res: Response): Promise<void> {
    const applicationId = req.params.applicationId as string;
    const userId = req.params.userId as string;
    const grant = await this.grantsService.findByUserAndApplication(
      userId,
      applicationId,
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
}
