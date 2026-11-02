# AGENTS.md

## Commands

- **Dev server**: `pnpm dev` (uses `tsx watch`)
- **Unit tests**: `pnpm test:unit` (fast, no MongoDB required)
- **Integration tests**: `pnpm test:integration` (requires MongoDB)
- **E2E tests**: `pnpm test:e2e` (requires MongoDB)
- **All tests**: `pnpm test` (runs unit -> integration -> e2e)
- **Tests**: `pnpm test` (Node native test runner, not Jest)
- **TDD watch**: `pnpm tdd`
- **Lint**: `pnpm lint` (oxlint) — `pnpm lint:fix` to apply fixes
- **Format**: `pnpm format` (oxfmt) — `pnpm format:check` to verify only
- **Commit**: `pnpm commit` (Commitizen conventional-changelog)
- **Owner bootstrap**: `pnpm bootstrap:owner` (idempotent, reads `OWNER_EMAIL`/`OWNER_PASSWORD`)
- **Preferred order**: `lint -> test`

## Architecture

- **Stack**: Express 5 + Mongoose (MongoDB) + TypeScript (ESM via `tsx`)
- **Entry point**: `src/index.ts` -> `src/config/bootstrap.ts`
- **Manual DI in `bootstrap.ts`**: all services and modules are instantiated and wired there. New services must be added to bootstrap.
- **Module pattern**: `users/`, `auth/`, `applications/` and `grants/` are the feature modules. Each has `{module,controller,router,service,interface,port,schema}` files.
- **Authorization**: global role `owner` (single) plus per-application grants (`viewer`/`editor`/`admin`). `ADMIN` is legacy and no longer authorizes; `OWNER_EMAIL`/`OWNER_PASSWORD` seed the owner.
- **`holders/`**: pre-verification accounts (staging area before a user is verified).
- **`src/libs/`**: shared infrastructure (logger/winston, crypto, jwt, mailer/nodemailer, templates/handlebars).
- **`src/common/`**: interceptors, middlewares (authentication, authorization), exceptions.

## Testing

- **Runner**: `node --test` with `tsx` and the global setup `test/setup.ts` (env + globals)
- **DB lifecycle**: `test/setup.db.ts` adds the MongoDB hooks (`before` connect+register, `beforeEach` flush, `after` drop+close). Only integration/e2e scripts load it.
- **Fixtures**: `test/fixtures/` for model registration; `test/mocks/` for stubs
- **Test env**: `process.loadEnvFile('.env.test')` in setup — not dotenv
- **DB isolation**: each test process gets its own database named `auth_db_test_${pid}`
- **MongoDB must be running** for integration/e2e only (use `docker-compose up -d mongo-auth`)
- **Globals**: `describe`, `test`, `assert`, `mock`, `before`, `beforeEach`, `after`, `afterEach` are attached to `global` in setup — do not import them in test files
- **Layout**: pure unit tests in `test/unit/` (no DB), DB-backed service tests in `test/integration/`, HTTP flows in `test/e2e/`

## Linting / Formatting

- **oxlint**: config in `.oxlintrc.json`, with type-aware rules via `oxlint-tsgolint` (`options.typeAware`):
  - `typescript/no-floating-promises`, `typescript/await-thenable`, `typescript/no-misused-promises` are **errors**
- **oxfmt**: config in `.oxfmtrc.jsonc` — single quotes, trailing commas, 80-char width, 2-space tabs
- **Pre-commit**: Husky runs `pnpm lint-staged` — TS files get `oxlint --fix` + `oxfmt`; JSON/MD/YML get `oxfmt`

## Environment

- **Env loading**: `process.loadEnvFile()` (Node.js native, not dotenv)
- **`.env` is gitignored**; `.env.test` and `.env.example` are committed
- **External services via docker-compose**: MongoDB (27017), MailHog (SMTP 1025, web UI 8025)
- **Local setup**: `cp .env.example .env` starts the service without editing it; `MONGO_URI` is the only variable without a default
- **Canonical reference**: the tables below mirror `README.md#environment-variables`; update both when adding a variable (the `#60` doc sweep re-checks them)

| Variable                               | Purpose                                             | Default                     | Required in production |
| -------------------------------------- | --------------------------------------------------- | --------------------------- | ---------------------- |
| `NODE_ENV`                             | Runtime mode; `production` rejects ephemeral keys   | `development`               | Recommended            |
| `HOST`                                 | HTTP bind interface                                 | `localhost`                 | No                     |
| `PORT`                                 | HTTP port                                           | `3000`                      | No                     |
| `APP_NAME`                             | Product name in emails and authenticator entries    | `Auth Service`              | No                     |
| `PUBLIC_APP_URL`                       | Base URL for invite/reset links                     | `https://ourservice.com`    | Yes                    |
| `TRUST_PROXY`                          | `false`, `true` or proxy hop count                  | `false`                     | Yes behind a proxy     |
| `CORS_ORIGINS`                         | Comma-separated allowed browser origins             | Empty (rejects all)         | Yes with browsers      |
| `MONGO_URI`                            | MongoDB connection string                           | None                        | Yes                    |
| `JWT_PRIVATE_KEY`                      | RS256 private key (PEM, `\n` escapes allowed)       | None                        | Yes                    |
| `JWT_PUBLIC_KEY`                       | RS256 public key                                    | Derived from private key    | No                     |
| `JWT_KEY_ID`                           | `kid` published in the JWKS                         | RFC 7638 thumbprint         | No                     |
| `JWT_ISSUER`                           | `iss` claim of every token                          | `auth-service`              | No                     |
| `JWT_ALLOW_EPHEMERAL_KEYS`             | In-memory keys when no PEM is set (local/test only) | `false`                     | No (must be false)     |
| `JWT_RETIRED_PUBLIC_KEYS`              | Retired `{kid, publicKey}` entries used in rotation | `[]`                        | No                     |
| `JWT_SECRET`                           | Legacy HS256 secret, no-audience tokens only        | None                        | No                     |
| `JWT_EXPIRATION`                       | Access token TTL (seconds)                          | `3600`                      | No                     |
| `JWT_REFRESH_EXPIRATION`               | Refresh token TTL (seconds)                         | `86400`                     | No                     |
| `JWT_REFRESH_EXPIRES_IN`               | Legacy alias of `JWT_REFRESH_EXPIRATION`            | `86400`                     | No                     |
| `SMTP_HOST`                            | SMTP host (`localhost` for MailHog)                 | Empty                       | Yes for email flows    |
| `SMTP_PORT`                            | SMTP port; `465` enables TLS                        | `0`                         | Yes for email flows    |
| `SMTP_USER`                            | SMTP username; empty disables auth                  | Empty                       | Depends on server      |
| `SMTP_PASS`                            | SMTP password                                       | Empty                       | Depends on server      |
| `MAIL_FROM`                            | `From` address of outgoing mail                     | `no-reply@auth-service.com` | No                     |
| `TEMPLATES_PATH`                       | Directory with the Handlebars templates             | Empty                       | Yes                    |
| `CODE_LENGTH`                          | Digits of the verification code                     | `6`                         | No                     |
| `CODE_EXPIRATION_MS`                   | Verification code TTL (ms)                          | `3600000`                   | No                     |
| `HOLDER_EXPIRATION_MS`                 | Holder account TTL (ms)                             | `3600000`                   | No                     |
| `MAX_LOGIN_ATTEMPTS`                   | Failed logins/MFA codes before lockout              | `5`                         | No                     |
| `LOCKOUT_DURATION_MS`                  | Lockout duration (ms)                               | `900000`                    | No                     |
| `BCRYPT_SALT_ROUNDS`                   | Password hashing cost                               | `10`                        | No                     |
| `MAX_SESSIONS_PER_USER`                | Sessions kept per user                              | `50`                        | No                     |
| `RATE_LIMIT_LOGIN_WINDOW_MS`           | Login rate-limit window (ms)                        | `900000`                    | No                     |
| `RATE_LIMIT_LOGIN_MAX`                 | Login requests per window                           | `5`                         | No                     |
| `RATE_LIMIT_SIGNUP_WINDOW_MS`          | Signup rate-limit window (ms)                       | `3600000`                   | No                     |
| `RATE_LIMIT_SIGNUP_MAX`                | Signup requests per window                          | `3`                         | No                     |
| `RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS` | Forgot-password window (ms)                         | `3600000`                   | No                     |
| `RATE_LIMIT_FORGOT_PASSWORD_MAX`       | Forgot-password requests per window                 | `3`                         | No                     |
| `RATE_LIMIT_REFRESH_WINDOW_MS`         | Refresh rate-limit window (ms)                      | `900000`                    | No                     |
| `RATE_LIMIT_REFRESH_MAX`               | Refresh requests per window                         | `60`                        | No                     |
| `RATE_LIMIT_MFA_VERIFY_WINDOW_MS`      | MFA verification window (ms)                        | `900000`                    | No                     |
| `RATE_LIMIT_MFA_VERIFY_MAX`            | MFA verification requests per window                | `10`                        | No                     |
| `INVITATION_LINK_EXPIRATION_MS`        | Invitation link TTL (ms)                            | `604800000`                 | No                     |
| `PASSWORD_RESET_LINK_EXPIRATION_MS`    | Password-reset link TTL (ms)                        | `3600000`                   | No                     |
| `AUDIT_RETENTION_DAYS`                 | Audit event retention (TTL index)                   | `90`                        | No                     |
| `MFA_SECRET_ENCRYPTION_KEY`            | Base64 32-byte key for TOTP secrets at rest         | Empty (plaintext)           | Yes                    |
| `MFA_CHALLENGE_EXPIRATION`             | MFA challenge TTL (seconds)                         | `300`                       | No                     |
| `TELEGRAM_BOT_TOKEN`                   | Bot token; empty disables notifications             | Empty                       | No                     |
| `TELEGRAM_OWNER_CHAT_ID`               | Owner fallback chat id                              | None                        | No                     |
| `TELEGRAM_TIMEOUT_MS`                  | Telegram delivery timeout (ms)                      | `3000`                      | No                     |
| `OWNER_EMAIL`                          | Owner email provisioned at startup                  | None                        | No                     |
| `OWNER_PASSWORD`                       | Owner initial password (paired with `OWNER_EMAIL`)  | None                        | No                     |

## TypeScript

- **Strict mode** with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — indexed access returns `T | undefined`
- **Module resolution**: `Bundler` (ESM), `verbatimModuleSyntax: false`
- **Decorators**: `experimentalDecorators: true` (used by Mongoose schemas)
- **No `rootDir`** set — output goes to `dist/`

## Project Status

- Core user CRUD and auth scaffolding are in place.
- Active work areas: applications and per-user permissions, refresh tokens, invitations, MFA, rate limiting.
- See `ROADMAP.md` for planned phases.
