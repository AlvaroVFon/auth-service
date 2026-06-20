import { Roles } from '../common/enums/roles.enum';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Roles;
        jti?: string;
        expiresAt?: Date;
      };
      tenantId?: string;
    }
  }
}

export {};
