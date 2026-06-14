# System Patterns

## Architecture

- **Stack:** Express 5 + Mongoose (MongoDB) + TypeScript (ESM via `tsx`)
- **Entry point:** `src/index.ts` → `src/config/bootstrap.ts`
- **Manual DI in `bootstrap.ts`:** All services and modules are instantiated and wired there. New services/config must be added to bootstrap.
- **Module pattern:** Feature modules (`users/`, `auth/`) with `{module,controller,router,service,interface,schema}` files.

## Key Patterns

- **Exception hierarchy:** `BaseError` → domain-specific errors (`InvalidCredentialsError`, `AccountLockedError`, etc.) in `src/common/exceptions/`.
- **Environment config:** `getStringEnvVariable` / `getNumberEnvVariable` from `env.config.ts`. Config values are read in `bootstrap.ts` and injected via constructors.
- **Rate limiting:** Global rate limiter (100 req/15min) applied in `GlobalMiddlewares`. Per-route rate limiters created via `createRateLimiter()` factory in `rate-limiter.middleware.ts`, injected through DI into `AuthRouter` for sensitive endpoints.
- **Schema serialization:** `toJSON.transform` strips sensitive fields (`password`, `__v`, and now `loginAttempts`, `lockoutUntil`).
- **Atomic updates:** Mongoose `findOneAndUpdate` with `$inc`/`$set` for concurrent-safe counter operations.

## Constraints

- Tests use `node --test` with `tsx` loader; globals (`describe`, `test`, `assert`, `mock`) are attached in `test/setup.ts`.
- DB isolation per test process (`auth_db_test_${pid}`).
- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are enabled in TypeScript strict mode.
