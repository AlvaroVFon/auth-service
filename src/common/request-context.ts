import type { Request } from 'express';

/** Client context attached to audit events. */
export interface RequestAuditContext {
  ipAddress?: string;
  userAgent?: string;
}

/** Extracts the request context shared by every audited controller. */
export const extractRequestContext = (req: Request): RequestAuditContext => {
  const userAgent = req.get('User-Agent');

  return {
    ...(req.ip === undefined ? {} : { ipAddress: req.ip }),
    ...(userAgent === undefined ? {} : { userAgent }),
  };
};
