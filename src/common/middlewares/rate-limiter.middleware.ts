import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { rateLimit } from 'express-rate-limit';

import type { RateLimitPolicy } from '../../settings';

export const GLOBAL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const GLOBAL_RATE_LIMIT_MAX = 100;
export const DEFAULT_RATE_LIMIT_MESSAGE =
  'Too many requests, please try again later.';

/** Upper bound of per-application limiter instances kept in memory. */
const MAX_CACHED_LIMITERS = 1000;

export const createRateLimiter = (
  windowMs: number,
  max: number,
  message = DEFAULT_RATE_LIMIT_MESSAGE,
  skip: (request: Request) => boolean = () => false,
) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    message: {
      error: message,
    },
    skip,
  });

export interface DynamicRateLimiterOptions {
  /**
   * Resolves the application that owns the request. Undefined means the
   * request is not scoped to an application and uses the global policy.
   */
  resolveApplicationId: (request: Request) => Promise<string | undefined>;
  /** Reads the effective policy of that application for this route. */
  resolvePolicy: (
    applicationId: string | undefined,
  ) => Promise<RateLimitPolicy>;
  message?: string;
  skip?: (request: Request) => boolean;
}

/**
 * Rate limiter whose window and maximum are resolved per request from the
 * settings layer. Each application keeps its own `express-rate-limit`
 * instance, so quotas are isolated and a policy change applies immediately
 * without a restart. The new instance starts with a fresh window, which is
 * the documented behaviour of changing a limiter policy in place.
 */
export const createDynamicRateLimiter = (
  options: DynamicRateLimiterOptions,
): RequestHandler => {
  const limiters = new Map<
    string,
    { signature: string; handler: RequestHandler }
  >();

  return (request: Request, response: Response, next: NextFunction): void => {
    void (async () => {
      try {
        const applicationId = await options.resolveApplicationId(request);
        const policy = await options.resolvePolicy(applicationId);
        const bucket = applicationId?.toLowerCase() ?? 'global';
        const signature = `${policy.windowMs}:${policy.max}`;
        let entry = limiters.get(bucket);

        if (entry === undefined || entry.signature !== signature) {
          if (entry === undefined && limiters.size >= MAX_CACHED_LIMITERS) {
            const oldest = limiters.keys().next().value;
            if (oldest !== undefined) {
              limiters.delete(oldest);
            }
          }
          entry = {
            signature,
            handler: createRateLimiter(
              policy.windowMs,
              policy.max,
              options.message,
              options.skip,
            ),
          };
          limiters.set(bucket, entry);
        }

        entry.handler(request, response, next);
      } catch (error) {
        next(error);
      }
    })();
  };
};
