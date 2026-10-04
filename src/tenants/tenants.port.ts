import { Tenant } from './tenants.interface';

export interface TenantsPort {
  verifyCredentials(tenantId: string, tenantSecret: string): Promise<Tenant>;
  findById(id: string): Promise<Tenant | null>;
}
