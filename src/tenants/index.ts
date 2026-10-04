import { Tenant } from './tentants.interface';

export type { Tenant } from './tentants.interface';

export interface TenantsPort {
  findById(id: string): Promise<Tenant | null>;
}
