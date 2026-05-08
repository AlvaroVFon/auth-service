import { rateLimit } from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-6',
  legacyHeaders: false,
  message: {
    error: 'Too many requests, please try again later.',
  },
});
