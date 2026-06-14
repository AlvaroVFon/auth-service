import { rateLimit } from 'express-rate-limit';

export const createRateLimiter = (
  windowMs: number,
  max: number,
  message = 'Too many requests, please try again later.',
) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-6',
    legacyHeaders: false,
    message: {
      error: message,
    },
  });

export const rateLimiter = createRateLimiter(15 * 60 * 1000, 100);
