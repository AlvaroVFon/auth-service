import type { Request, Response } from 'express';
import { AuthTenantService } from '../services/auth-tenant.service';

export class AuthTenantController {
  constructor(private readonly authTenantService: AuthTenantService) {}

  async login(req: Request, res: Response): Promise<void> {
    const { tenantId, tenantSecret } = req.body;
    const token = await this.authTenantService.login({
      tenantId,
      tenantSecret,
    });

    res.status(200).json({ token });
  }
}
