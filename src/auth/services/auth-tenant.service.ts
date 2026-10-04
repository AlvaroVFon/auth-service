import { JwtService } from '../../libs/jwt';
import { TenantsPort } from '../../tenants';

export interface AuthTenantCredentials {
  tenantId: string;
  tenantSecret: string;
}

export class AuthTenantService {
  constructor(
    private readonly tenantsService: TenantsPort,
    private readonly jwtService: JwtService,
  ) {}

  async login(credentials: AuthTenantCredentials): Promise<string> {
    const tenant = await this.tenantsService.verifyCredentials(
      credentials.tenantId,
      credentials.tenantSecret,
    );

    return this.jwtService.generateTenantToken(String(tenant._id));
  }
}
