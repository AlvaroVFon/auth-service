import type { Request } from 'express';

/** Optional client context attached to audit events. */
export interface RequestAuditContext {
  ipAddress?: string;
  userAgent?: string;
}

/** Request context with both keys present, as the auth services consume it. */
export interface RequestContext {
  ipAddress: string | undefined;
  userAgent: string | undefined;
}

/** Extracts the request context shared by every audited controller. */
export const extractRequestContext = (req: Request): RequestContext => ({
  ipAddress: req.ip,
  userAgent: req.get('User-Agent'),
});
