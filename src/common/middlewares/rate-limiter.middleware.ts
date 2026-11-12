import type { Request } from 'express';
import { rateLimit } from 'express-rate-limit';

export const GLOBAL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const GLOBAL_RATE_LIMIT_MAX = 100;
export const DEFAULT_RATE_LIMIT_MESSAGE =
  'Too many requests, please try again later.';

export const createRateLimiter = (
  windowMs: number,
  max: number,
  message = DEFAULT_RATE_LIMIT_MESSAGE,
  skip: (request: Request) => boolean = () => false,
  keyGenerator?: (request: Request) => string,
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
    ...(keyGenerator === undefined
      ? {}
      : { keyGenerator: (request: Request) => keyGenerator(request) }),
  });
