import { Request, Response } from 'express';

import { Catch } from '../common/decorators/catch.decorator';
import { SettingsAdminService } from './settings-admin.service';

export class SettingsController {
  constructor(private readonly settingsAdminService: SettingsAdminService) {}

  @Catch()
  async getSettings(_req: Request, res: Response): Promise<void> {
    const settings = await this.settingsAdminService.getGlobal();

    res.status(200).json(settings);
  }

  @Catch()
  async getApplicationSettings(req: Request, res: Response): Promise<void> {
    const settings = await this.settingsAdminService.getApplication(
      req.params.applicationId as string,
    );

    res.status(200).json(settings);
  }

  @Catch()
  async updateSettings(req: Request, res: Response): Promise<void> {
    const settings = await this.settingsAdminService.updateGlobal(
      (req.body ?? {}) as Record<string, unknown>,
      req.user?.id,
    );

    res.status(200).json(settings);
  }
}
