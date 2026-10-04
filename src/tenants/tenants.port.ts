import { Tenant } from './tenants.interface';

export interface TenantsPort {
  findById(id: string): Promise<Tenant | null>;
}
