import { Roles } from '../common/enums/roles.enum';
import type { GrantRoles } from '../grants/grants.interface';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Roles | GrantRoles;
        jti?: string;
        expiresAt?: Date;
        audience?: string;
      };
    }
  }
}

export {};
