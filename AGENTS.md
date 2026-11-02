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
- **`.env` is gitignored**; `.env.test` is committed
- **External services via docker-compose**: MongoDB (27017), MailHog (SMTP 1025, web UI 8025)
- **Key env vars**: `MONGO_URI`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_KEY_ID`, `JWT_RETIRED_PUBLIC_KEYS`, `JWT_ISSUER`, `JWT_ALLOW_EPHEMERAL_KEYS` (local/test only), `JWT_SECRET` (legacy HS256 only), `JWT_EXPIRATION`, `JWT_REFRESH_EXPIRATION`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `SMTP_*`, `TEMPLATES_PATH`, `CODE_LENGTH`, `CODE_EXPIRATION_MS`

## TypeScript

- **Strict mode** with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — indexed access returns `T | undefined`
- **Module resolution**: `Bundler` (ESM), `verbatimModuleSyntax: false`
- **Decorators**: `experimentalDecorators: true` (used by Mongoose schemas)
- **No `rootDir`** set — output goes to `dist/`

## Project Status

- Core user CRUD and auth scaffolding are in place.
- Active work areas: applications and per-user permissions, refresh tokens, invitations, MFA, rate limiting.
- See `ROADMAP.md` for planned phases.
