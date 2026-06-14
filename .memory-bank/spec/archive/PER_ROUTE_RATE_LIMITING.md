# Per-Route Rate Limiting for Auth Endpoints

## Purpose

Add strict, differentiated rate limiting policies to sensitive authentication endpoints (`/auth/login`, `/auth/signup`, `/auth/forgot-password`) as part of the Phase 3 Security Hardening. Each endpoint gets its own rate limit (requests per time window), configurable via environment variables, applied as route-level middleware. The existing global rate limiter (100 req/15min) remains in place for all other routes.

## Acceptance Criteria

- `POST /auth/login` is protected by a dedicated rate limiter with configurable max requests and window (defaults: 5 requests per 15 minutes per IP)
- `POST /auth/signup` is protected by a dedicated rate limiter with configurable max requests and window (defaults: 3 requests per 1 hour per IP)
- `POST /auth/forgot-password` is protected by a dedicated rate limiter with configurable max requests and window (defaults: 3 requests per 1 hour per IP)
- When a per-route rate limit is exceeded, the server responds with HTTP 429 and a JSON body `{ "error": "Too many requests, please try again later." }`
- Standard rate limit response headers (`draft-6` format) are included in all responses from rate-limited endpoints
- Per-route rate limiters operate independently — exhausting the login limit does not affect signup or forgot-password limits
- The global rate limiter (100 req/15min) continues to apply to all routes, including auth routes (per-route limits are stricter and hit first)
- All limit values and window durations are configurable via environment variables with sensible defaults
- Existing auth endpoint functionality (login, signup, forgot-password) is not affected when rate limits are not exceeded

## Technical Notes

### Environment Variables

New env vars to add (with defaults):

| Variable                               | Default   | Description                             |
| -------------------------------------- | --------- | --------------------------------------- |
| `RATE_LIMIT_LOGIN_MAX`                 | `5`       | Max login requests per window           |
| `RATE_LIMIT_LOGIN_WINDOW_MS`           | `900000`  | Login window in ms (15 min)             |
| `RATE_LIMIT_SIGNUP_MAX`                | `3`       | Max signup requests per window          |
| `RATE_LIMIT_SIGNUP_WINDOW_MS`          | `3600000` | Signup window in ms (1 hour)            |
| `RATE_LIMIT_FORGOT_PASSWORD_MAX`       | `3`       | Max forgot-password requests per window |
| `RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS` | `3600000` | Forgot-password window in ms (1 hour)   |

### Architecture Approach

- **Factory function**: Add a `createRateLimiter(windowMs, limit, message?)` factory to `src/common/middlewares/rate-limiter.middleware.ts` that returns a configured `express-rate-limit` middleware instance. The existing global `rateLimiter` constant remains unchanged.
- **DI through AuthModule → AuthRouter**: Bootstrap reads env vars, creates rate limiter instances via the factory, and passes them through `AuthModule` constructor → `AuthRouter` constructor. The router applies them as route-level middleware before the controller handler.
- **Route-level application**: In `AuthRouter.initializeRoutes()`, each sensitive route gets its specific rate limiter as middleware: `this.app.post('/auth/login', loginRateLimiter, controller.login)`.
- **Test configuration**: `.env.test` should set low limits (e.g., 2 requests per 5 seconds) to make E2E tests fast and deterministic.

### Files Expected to Change

- `src/common/middlewares/rate-limiter.middleware.ts` — add factory function
- `src/auth/auth.router.ts` — accept and apply per-route rate limiters
- `src/auth/auth.module.ts` — accept rate limiter config, pass to router
- `src/config/bootstrap.ts` — read env vars, create limiters, inject into module
- `test/utils/app.ts` — wire test-specific rate limit config
- `.env.test` — add rate limit env vars with test-friendly values

## Dependencies

- `express-rate-limit` v8 (already installed)
- Existing global rate limiter middleware (`src/common/middlewares/rate-limiter.middleware.ts`)
- Existing DI pattern via `bootstrap.ts` → `AuthModule` → `AuthRouter`
- Account lockout mechanism (ADR-001) is complementary — rate limiting is IP-based, lockout is account-based; both layers coexist

## Out of Scope

- Rate limiting for `/auth/reset-password`, `/auth/refresh`, `/auth/logout`, `/auth/verify`, `/auth/tenant/login` (can be added later)
- Distributed rate limiting (e.g., Redis-backed store) — current in-memory store is sufficient for single-instance deployment
- Rate limiting by user identifier (email, account ID) — IP-based only for now
- Custom rate limit response bodies per endpoint — a single standard message is used
- Rate limit bypass mechanisms (e.g., API keys, whitelists)
