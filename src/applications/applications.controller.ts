import { Request, Response } from 'express';

import { Catch } from '../common/decorators/catch.decorator';
import { EntityNotFoundError } from '../common/exceptions/base.exception';
import { parseListQuery } from '../common/pagination';
import {
  APPLICATION_LIST_OPTIONS,
  type ApplicationSortField,
} from './applications.port';
import { ApplicationsService } from './applications.service';

export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Catch()
  async create(req: Request, res: Response): Promise<void> {
    const { name, slug, audience } = req.body ?? {};
    const application = await this.applicationsService.create({
      name,
      slug,
      audience,
    });

    res.status(201).json(application);
  }

  @Catch()
  async findAll(req: Request, res: Response): Promise<void> {
    const query = parseListQuery<ApplicationSortField>(
      req.query as Record<string, unknown>,
      APPLICATION_LIST_OPTIONS,
    );
    const applications = await this.applicationsService.findAll(query);

    res.status(200).json(applications);
  }

  @Catch()
  async findById(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const application = await this.applicationsService.findById(id);

    if (!application) {
      throw new EntityNotFoundError('Application not found');
    }

    res.status(200).json(application);
  }

  @Catch()
  async update(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const application = await this.applicationsService.update(
      id,
      req.body ?? {},
      req.user?.id,
    );

    res.status(200).json(application);
  }

  @Catch()
  async archive(req: Request, res: Response): Promise<void> {
    const id = req.params.id as string;
    const application = await this.applicationsService.archive(
      id,
      req.user?.id,
    );

    res.status(200).json(application);
  }
}
