# AGENTS.md

## Commands

- **Dev server**: `pnpm dev` (uses `tsx watch`)
- **Tests**: `pnpm test` (Node native test runner, not Jest)
- **TDD watch**: `pnpm tdd`
- **Lint**: `pnpm lint` (eslint flat config)
- **Format**: `pnpm format`
- **Commit**: `pnpm commit` (Commitizen conventional-changelog)
- **Preferred order**: `lint -> test`

## Architecture

- **Stack**: Express 5 + Mongoose (MongoDB) + TypeScript (ESM via `tsx`)
- **Entry point**: `src/index.ts` -> `src/config/bootstrap.ts`
- **Manual DI in `bootstrap.ts`**: all services and modules are instantiated and wired there. New services must be added to bootstrap.
- **Module pattern**: `users/` and `auth/` are the two feature modules. Each has `{module,controller,router,service,interface,schema}` files.
- **`holders/`**: tenant/ownership abstraction (multi-tenancy foundation, not yet active).
- **`src/libs/`**: shared infrastructure (logger/winston, crypto, jwt, mailer/nodemailer, templates/handlebars).
- **`src/common/`**: interceptors, middlewares (authentication, authorization), exceptions.

## Testing

- **Runner**: `node --test` with `tsx` loader and `test/setup.ts`
- **Fixtures**: `test/fixtures/` for model registration; `test/mocks/` for stubs
- **Test env**: `process.loadEnvFile('.env.test')` in setup — not dotenv
- **DB isolation**: each test process gets its own database named `auth_db_test_${pid}`; `beforeEach` flushes, `afterEach` drops
- **MongoDB must be running** for tests to pass (use `docker-compose up -d mongo-auth`)
- **Globals**: `describe`, `test`, `assert`, `mock`, `before`, `beforeEach`, `after`, `afterEach` are attached to `global` in setup — do not import them in test files
- **E2E tests** live in `test/e2e/`, unit tests in `test/unit/src/`

## Linting / Formatting

- **ESLint**: flat config (`eslint.config.mjs`), `typescript-eslint` with strict rules:
  - `no-floating-promises`, `await-thenable`, `no-misused-promises` are **errors** (not warnings)
- **Prettier**: single quotes, trailing commas, 80-char width, 2-space tabs
- **Pre-commit**: Husky runs `pnpm lint-staged` — TS files get eslint --fix + prettier; JSON/MD/YML get prettier

## Environment

- **Env loading**: `process.loadEnvFile()` (Node.js native, not dotenv)
- **`.env` is gitignored**; `.env.test` is committed
- **External services via docker-compose**: MongoDB (27017), MailHog (SMTP 1025, web UI 8025)
- **Key env vars**: `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRATION`, `JWT_REFRESH_EXPIRATION`, `SMTP_*`, `TEMPLATES_PATH`, `CODE_LENGTH`, `CODE_EXPIRATION_MS`

## TypeScript

- **Strict mode** with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` — indexed access returns `T | undefined`
- **Module resolution**: `Bundler` (ESM), `verbatimModuleSyntax: false`
- **Decorators**: `experimentalDecorators: true` (used by Mongoose schemas)
- **No `rootDir`** set — output goes to `dist/`

## Project Status

- Core user CRUD and auth scaffolding are in place.
- Active work areas: refresh tokens, password recovery flow, rate limiting, account lockout, OAuth2, multi-tenancy.
- See `ROADMAP.md` for planned phases.
