import { Request, Response } from 'express';

import { Catch } from '../common/decorators/catch.decorator';
import type { AdminPort } from './admin.port';

export class AdminController {
  constructor(private readonly adminService: AdminPort) {}

  @Catch()
  async getOverview(_req: Request, res: Response): Promise<void> {
    const overview = await this.adminService.getOverview();

    res.status(200).json(overview);
  }
}
