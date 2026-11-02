# System Patterns

## Architecture

- **Stack:** Express 5 + Mongoose (MongoDB) + TypeScript (ESM via `tsx`).
- **Entry point:** `src/index.ts` → `src/config/bootstrap.ts`.
- **Composition root:** `createApplicationComposition()` in `src/config/application.composition.ts` builds the logger, database, mailer, keyring, services and modules, exposes `initialize(app)` to mount the routes, and accepts `ApplicationCompositionOptions` (logger, database, JWT config, mailer, rate limits, CORS origins, trust proxy, Telegram) so tests can inject doubles. `bootstrap.ts` owns the lifecycle (load `.env`, connect, provision the owner, listen) and its overrides are only lifecycle ones: `logger`, `database`, `app`, `startServer`, `ownerBootstrap` and `ownerCredentials`.
- **HTTP modules** (`{module,controller,router,service,interface,schema}`): `users/`, `auth/` (with `codes/`, `mfa/`, `services/`, `tokens/`), `applications/`, `grants/`, `links/`, `audit/`, `health/`, `jwks/`.
- **Domain-only modules:** `holders/` (pre-verification accounts, no HTTP surface). `applications/` and `grants/` also expose a port consumed by `auth/`, `users/` and `links/`.
- **Adapters:** `src/libs/` hides the vendor behind an interface — winston, nodemailer, handlebars, Node crypto (bcrypt + AES-256-GCM), jsonwebtoken keyring and the Telegram HTTP client. Services depend on the interface, never on the adapter.

## Key Patterns

- **Exception hierarchy:** `BaseError` → domain-specific errors (`InvalidCredentialsError`, `AccountLockedError`, `EntityNotFoundError`, `InfraError`, …) in `src/common/exceptions/`; `HttpInterceptor` maps them to responses.
- **Environment config:** `getStringEnvVariable` / `getNumberEnvVariable` / `requireEnvVariable` from `env.config.ts`. Values are resolved in the composition and injected via constructors; `jwt.config.ts`, `cors.config.ts`, `trust-proxy.config.ts`, `telegram.config.ts` and `owner.config.ts` parse and validate their own groups.
- **JWT keyring:** RS256 with an active key plus retired public keys; the JWKS controller publishes only public material and `JwtService` adds the `iss`/`aud`/`jti` claims.
- **Rate limiting:** global limiter fixed at 100 req / 15 min (probes skipped) plus per-route limiters created by a factory and injected into `AuthRouter`; only the per-route windows and maxima come from environment variables.
- **Authorization:** `AuthenticationMiddleware` validates the token and blacklist; `AuthorizationMiddleware` checks global roles; `ApplicationAuthorizationMiddleware` resolves the grant of the user in the application of the path on every request.
- **Schema serialization:** `toJSON.transform` on the `User` and `Holder` schemas strips sensitive fields (`password`, `__v`, `loginAttempts`, `lockoutUntil`); token, link and session documents are never returned as-is.
- **Atomic updates:** `findOneAndUpdate` with `$inc`/`$set` for lockout counters, refresh rotation (`revokedAt`, `replacedByJti`) and single-use link consumption.
- **Best-effort side effects:** audit writes and Telegram notifications log a warning and never break the primary flow.
- **Single-use links:** the token is returned once and stored only as a SHA-256 hash; acceptance compares hashes and marks the link consumed atomically.

## Constraints

- Tests use `node --test` with the `tsx` loader; globals (`describe`, `test`, `assert`, `mock`, …) are attached in `test/setup.ts`.
- DB isolation per test process (`auth_db_test_${pid}`); integration and e2e need a running MongoDB.
- TypeScript strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
- Rate limiting and the access-token blacklist assume a single instance; multi-instance deployments need shared stores.
- Documentation contract: `README.md` (setup, environment variables, API reference, deployment), `AGENTS.md` (working conventions) and `ROADMAP.md` (phases) must describe the deployed behaviour; a change that alters routes, modules or variables updates them in the same PR.
