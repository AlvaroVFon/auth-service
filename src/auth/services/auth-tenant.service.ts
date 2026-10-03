import { Types } from 'mongoose';

import { UnauthorizedError } from '../../common/exceptions/auth.exceptions';
import { InvalidArgumentError } from '../../common/exceptions/base.exception';
import { JwtService } from '../../libs/jwt/jwt.service';
import { TenantsService } from '../../tenants/tenants.service';

export interface AuthTenantCredentials {
  tenantId: string;
  tenantSecret: string;
}

export class AuthTenantService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
  ) {}

  async login(credentials: AuthTenantCredentials): Promise<string> {
    if (!credentials.tenantId) {
      throw new InvalidArgumentError('Tenant ID is required');
    }
    if (!Types.ObjectId.isValid(credentials.tenantId)) {
      throw new InvalidArgumentError('Tenant ID is invalid');
    }
    if (!credentials.tenantSecret) {
      throw new InvalidArgumentError('Tenant secret is required');
    }

    const tenant = await this.tenantsService.findById(credentials.tenantId);
    if (!tenant) {
      throw new UnauthorizedError('Invalid credentials');
    }

    if (tenant.secret !== credentials.tenantSecret) {
      throw new UnauthorizedError('Invalid credentials');
    }

    return this.jwtService.generateTenantToken(String(tenant._id));
  }
}
