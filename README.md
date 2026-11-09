# Auth Service

Authentication and authorization service built with Express 5, Mongoose, and TypeScript.

New to the service? Start with the [Getting Started guide](docs/getting-started/README.md):
concepts, local setup and the three integration flows.

## Features

- User registration and signup with email verification
- JWT-based authentication (access + refresh tokens)
- Access token blacklist (revoke before expiry)
- Session tracking (IP address and user-agent on refresh tokens)
- Password reset flow
- Account lockout after failed login attempts
- Per-route rate limiting
- Role-based authorization: a single `owner` administers the home while legacy `ADMIN` no longer authorizes
- Home applications with per-user roles (viewer, editor, admin)
- Login scoped to a concrete application (audience + grant role)
- Session profile (`GET /auth/me`), panel bootstrap (`GET /auth/context`) and token introspection (`POST /auth/introspect`)
- Refresh rotation with the refresh token alone, even after the access token expired
- Independent device sessions with listing and selective revocation
- Shareable, single-use invitation and password-reset links (no SMTP required)
- Owner-only audit log of authentication and permission events
- TOTP multi-factor authentication with single-use recovery codes
- Telegram delivery of invitation and reset links
- Case-insensitive email normalization and enumeration-safe auth errors
- Readiness and liveness probes, published JWKS and graceful shutdown
- CORS allowlist, `helmet` headers and configurable trust proxy

## Getting Started

### Prerequisites

- Node.js 22+
- MongoDB (via Docker or local)
- pnpm

### Setup

```bash
cp .env.example .env
pnpm install
docker-compose up -d
pnpm dev
```

`.env.example` (versioned) already contains safe values for a local machine: MongoDB on
`localhost:27017`, MailHog on `localhost:1025`, ephemeral JWT keys and a local MFA
encryption key. Copy it and the service starts as-is, with `GET /health` answering.

Variables are read once at startup (`process.loadEnvFile()` in `src/config/bootstrap.ts`
loads `.env` when it exists) and missing numeric or string settings fall back to the
defaults below. `MONGO_URI` is the only variable with no default: without it the process
exits with an `InvalidArgumentError`. See [Environment variables](#environment-variables)
for the purpose, default value and production requirement of each one, and
[API reference](#api-reference) for every route and its access level.

Policy settings (`JWT_EXPIRATION`, `JWT_REFRESH_EXPIRATION`/`JWT_REFRESH_EXPIRES_IN`,
`MAX_SESSIONS_PER_USER`, `INVITATION_LINK_EXPIRATION_MS` and `APP_NAME`) are copied
into the global settings document the first time the service boots. From then on the
stored value wins over the environment, so changing those variables requires updating
the global settings (the settings endpoints arrive with #149/#150) or removing the
`global` document to re-seed; they are bootstrap-only after the first run.

### Environment variables

#### Application

| Variable         | Purpose                                                       | Default                  | Required in production   |
| ---------------- | ------------------------------------------------------------- | ------------------------ | ------------------------ |
| `NODE_ENV`       | Runtime mode; `production` rejects ephemeral JWT keys.        | `development`            | Recommended              |
| `HOST`           | Interface the HTTP server binds to.                           | `localhost`              | No                       |
| `PORT`           | HTTP port.                                                    | `3000`                   | No                       |
| `APP_NAME`       | Product name used in emails and authenticator entries.        | `Auth Service`           | No                       |
| `PUBLIC_APP_URL` | Base URL of the SPA that receives invitation and reset links. | `https://ourservice.com` | Yes                      |
| `TRUST_PROXY`    | `false`, `true` or a non-negative proxy hop count.            | `false`                  | Yes behind a proxy       |
| `CORS_ORIGINS`   | Comma-separated allowed browser origins; empty rejects all.   | Empty                    | Yes with browser clients |

#### Database

| Variable    | Purpose                    | Default | Required in production |
| ----------- | -------------------------- | ------- | ---------------------- |
| `MONGO_URI` | MongoDB connection string. | None    | Yes                    |

#### JWT

| Variable                   | Purpose                                                                   | Default             | Required in production |
| -------------------------- | ------------------------------------------------------------------------- | ------------------- | ---------------------- |
| `JWT_PRIVATE_KEY`          | RS256 private key in PEM; `\n` escapes are accepted.                      | None                | Yes                    |
| `JWT_PUBLIC_KEY`           | RS256 public key in PEM; derived from the private key when omitted.       | Derived             | No                     |
| `JWT_KEY_ID`               | `kid` published in the JWKS; used to rotate keys.                         | RFC 7638 thumbprint | No                     |
| `JWT_KEY_PUBLISHED_AT`     | ISO 8601 timestamp with explicit `Z`/offset; shown by `/jwks/status`.     | Keyring load time   | No                     |
| `JWT_ISSUER`               | `iss` claim of every token.                                               | `auth-service`      | No                     |
| `JWT_ALLOW_EPHEMERAL_KEYS` | Generates in-memory keys when no PEM is configured; local/test only.      | `false`             | No (must be false)     |
| `JWT_RETIRED_PUBLIC_KEYS`  | JSON `{"kid","publicKey","publishedAt"}` entries accepted while rotating. | `[]`                | No                     |
| `JWT_SECRET`               | Legacy HS256 secret to verify old tokens without audience.                | None                | No                     |
| `JWT_EXPIRATION`           | Access token TTL in seconds.                                              | `3600`              | No                     |
| `JWT_REFRESH_EXPIRATION`   | Refresh token TTL in seconds.                                             | `86400`             | No                     |
| `JWT_REFRESH_EXPIRES_IN`   | Legacy alias of `JWT_REFRESH_EXPIRATION`; keep unset.                     | `86400`             | No                     |

#### SMTP and templates

| Variable         | Purpose                                       | Default                     | Required in production     |
| ---------------- | --------------------------------------------- | --------------------------- | -------------------------- |
| `SMTP_HOST`      | SMTP server host (`localhost` for MailHog).   | Empty                       | Yes for email flows        |
| `SMTP_PORT`      | SMTP server port; `465` enables TLS.          | `0`                         | Yes for email flows        |
| `SMTP_USER`      | SMTP username; empty disables authentication. | Empty                       | Depends on the SMTP server |
| `SMTP_PASS`      | SMTP password.                                | Empty                       | Depends on the SMTP server |
| `MAIL_FROM`      | `From` address of outgoing mail.              | `no-reply@auth-service.com` | No                         |
| `TEMPLATES_PATH` | Directory with the Handlebars templates.      | Empty                       | Yes                        |

#### Codes, holders and account security

| Variable               | Purpose                                           | Default   | Required in production |
| ---------------------- | ------------------------------------------------- | --------- | ---------------------- |
| `CODE_LENGTH`          | Digits of the email verification code.            | `6`       | No                     |
| `CODE_EXPIRATION_MS`   | Verification code TTL in milliseconds.            | `3600000` | No                     |
| `HOLDER_EXPIRATION_MS` | TTL of a pre-verification holder account.         | `3600000` | No                     |
| `MAX_LOGIN_ATTEMPTS`   | Failed logins (and MFA codes) before the lockout. | `5`       | No                     |
| `LOCKOUT_DURATION_MS`  | Lockout duration in milliseconds.                 | `900000`  | No                     |
| `BCRYPT_SALT_ROUNDS`   | Password hashing cost.                            | `10`      | No                     |

#### Sessions and rate limiting

| Variable                               | Purpose                                         | Default   | Required in production |
| -------------------------------------- | ----------------------------------------------- | --------- | ---------------------- |
| `MAX_SESSIONS_PER_USER`                | Sessions kept per user; the oldest are revoked. | `50`      | No                     |
| `RATE_LIMIT_LOGIN_WINDOW_MS`           | Login rate-limit window.                        | `900000`  | No                     |
| `RATE_LIMIT_LOGIN_MAX`                 | Login requests allowed per window.              | `5`       | No                     |
| `RATE_LIMIT_SIGNUP_WINDOW_MS`          | Signup rate-limit window.                       | `3600000` | No                     |
| `RATE_LIMIT_SIGNUP_MAX`                | Signup requests allowed per window.             | `3`       | No                     |
| `RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS` | Forgot-password rate-limit window.              | `3600000` | No                     |
| `RATE_LIMIT_FORGOT_PASSWORD_MAX`       | Forgot-password requests per window.            | `3`       | No                     |
| `RATE_LIMIT_REFRESH_WINDOW_MS`         | Token refresh rate-limit window.                | `900000`  | No                     |
| `RATE_LIMIT_REFRESH_MAX`               | Refresh requests allowed per window.            | `60`      | No                     |
| `RATE_LIMIT_MFA_VERIFY_WINDOW_MS`      | MFA verification rate-limit window.             | `900000`  | No                     |
| `RATE_LIMIT_MFA_VERIFY_MAX`            | MFA verification requests per window.           | `10`      | No                     |

#### Links, audit, MFA and Telegram

| Variable                            | Purpose                                                                                | Default     | Required in production |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ----------- | ---------------------- |
| `INVITATION_LINK_EXPIRATION_MS`     | Invitation link TTL.                                                                   | `604800000` | No                     |
| `PASSWORD_RESET_LINK_EXPIRATION_MS` | Password-reset link TTL.                                                               | `3600000`   | No                     |
| `AUDIT_RETENTION_DAYS`              | Audit event retention through the TTL index.                                           | `90`        | No                     |
| `MFA_SECRET_ENCRYPTION_KEY`         | Base64-encoded 32-byte key that encrypts TOTP secrets; empty stores them as plaintext. | `Empty`     | Yes                    |
| `MFA_CHALLENGE_EXPIRATION`          | MFA challenge TTL in seconds.                                                          | `300`       | No                     |
| `TELEGRAM_BOT_TOKEN`                | Bot token; empty disables Telegram notifications.                                      | `Empty`     | No                     |
| `TELEGRAM_OWNER_CHAT_ID`            | Owner fallback chat id for link notifications.                                         | None        | No                     |
| `TELEGRAM_TIMEOUT_MS`               | Telegram delivery timeout in milliseconds.                                             | `3000`      | No                     |

#### Owner bootstrap

| Variable         | Purpose                                                  | Default | Required in production |
| ---------------- | -------------------------------------------------------- | ------- | ---------------------- |
| `OWNER_EMAIL`    | Email of the single owner provisioned at startup.        | None    | No                     |
| `OWNER_PASSWORD` | Initial owner password; set together with `OWNER_EMAIL`. | None    | No                     |

## API reference

Every route is declared in a module router and mounted by
`createApplicationComposition().initialize(app)`. Access levels:

- **Public**: no token required.
- **Authenticated**: any valid access token, from the owner or from an application user.
- **Owner**: the global owner only (`/users`, the application catalog, audit and reset links).
- **App admin**: the owner or the `admin` of the application in the path.

### Probes and keys

| Method | Route                    | Access | Notes                                             |
| ------ | ------------------------ | ------ | ------------------------------------------------- |
| `GET`  | `/health`                | Public | Liveness; never touches MongoDB.                  |
| `GET`  | `/ready`                 | Public | `503` until the database connection is ready.     |
| `GET`  | `/.well-known/jwks.json` | Public | Public keys for RS256 verification.               |
| `GET`  | `/jwks/status`           | Owner  | Active and retired `kid`s with publication dates. |

### Authentication and sessions

| Method   | Route                       | Access        | Notes                                                                                    |
| -------- | --------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `POST`   | `/auth/signup`              | Public        | Rate-limited; creates a holder and mails a code.                                         |
| `POST`   | `/auth/verify`              | Public        | Holder -> user with the emailed code.                                                    |
| `POST`   | `/auth/login`               | Public        | Rate-limited; optional `application`, returns MFA challenge when enabled.                |
| `POST`   | `/auth/refresh`             | Public        | Rate-limited; rotates the refresh token alone.                                           |
| `POST`   | `/auth/logout`              | Authenticated | Revokes the caller's sessions for the token's application (every session when unscoped). |
| `POST`   | `/auth/forgot-password`     | Public        | Rate-limited; never reveals whether the email exists.                                    |
| `POST`   | `/auth/reset-password`      | Public        | `userId` + emailed code.                                                                 |
| `GET`    | `/auth/me`                  | Authenticated | Identity, audience/app and token role.                                                   |
| `GET`    | `/auth/context`             | Authenticated | Identity, global role and applications with the caller's role.                           |
| `POST`   | `/auth/introspect`          | Authenticated | Answers `active` only for the caller's own tokens.                                       |
| `GET`    | `/auth/sessions`            | Authenticated | Active device sessions.                                                                  |
| `DELETE` | `/auth/sessions/:sessionId` | Authenticated | Revokes one session; repeating it is a no-op.                                            |
| `DELETE` | `/auth/sessions`            | Authenticated | Revokes every session of the caller.                                                     |
| `POST`   | `/auth/mfa/enroll`          | Authenticated | Rate-limited; returns `secret` and `otpauthUrl`.                                         |
| `POST`   | `/auth/mfa/activate`        | Authenticated | Confirms the first code and returns recovery codes.                                      |
| `POST`   | `/auth/mfa/verify`          | Public        | Rate-limited; exchanges the challenge for tokens.                                        |
| `POST`   | `/auth/mfa/disable`         | Authenticated | Password + TOTP/recovery code.                                                           |

### Links

| Method | Route                                      | Access    | Notes                                        |
| ------ | ------------------------------------------ | --------- | -------------------------------------------- |
| `POST` | `/applications/:applicationId/invitations` | App admin | Single-use invitation for an email and role. |
| `POST` | `/auth/invitations/accept`                 | Public    | Sets the password and grants the role.       |
| `POST` | `/auth/password-reset-links`               | Owner     | Generates a shareable reset link.            |
| `POST` | `/auth/password-reset-links/accept`        | Public    | Consumes the link and rotates the password.  |

### Users, applications and grants

| Method   | Route                                         | Access           | Notes                                                           |
| -------- | --------------------------------------------- | ---------------- | --------------------------------------------------------------- |
| `POST`   | `/users`                                      | Owner            | Creates a verified user directly.                               |
| `GET`    | `/users`                                      | Owner            | Lists users; paginated envelope (see below).                    |
| `GET`    | `/users/:id`                                  | Owner            | Reads one user.                                                 |
| `GET`    | `/users/:id/sessions`                         | Owner            | Lists the active sessions of a user.                            |
| `PATCH`  | `/users/:id`                                  | Owner            | Updates profile fields only; any other field returns `400`.     |
| `DELETE` | `/users/:id`                                  | Owner            | Deletes the user and cascades its grants; not the owner.        |
| `POST`   | `/users/:id/unlock`                           | Owner            | Clears login and MFA lockout counters; audited.                 |
| `POST`   | `/users/:id/verify`                           | Owner            | Marks the account as verified; audited.                         |
| `POST`   | `/applications`                               | Owner            | Creates an application (name, slug, audience).                  |
| `GET`    | `/applications`                               | Owner            | Lists applications; paginated envelope (see below).             |
| `GET`    | `/applications/:id`                           | Owner, app admin | Reads one application; anyone else gets `404`.                  |
| `PATCH`  | `/applications/:id`                           | Owner            | Renames or (de)activates; `slug` and `audience` are immutable.  |
| `DELETE` | `/applications/:id`                           | Owner            | Archives the application (`active=false`); it is never deleted. |
| `GET`    | `/applications/:applicationId/members`        | Owner, app admin | Paginated member listing with readable user data.               |
| `PUT`    | `/applications/:applicationId/grants`         | Owner, app admin | Upserts the role of a user in the application.                  |
| `GET`    | `/applications/:applicationId/grants`         | Owner, app admin | Lists the application grants.                                   |
| `GET`    | `/applications/:applicationId/grants/:userId` | Owner, app admin | Reads one grant.                                                |
| `DELETE` | `/applications/:applicationId/grants/:userId` | Owner, app admin | Revokes a grant.                                                |

`PATCH /users/:id` only accepts the profile allowlist: `username`, `email`,
`password` and `telegramChatId` (use `null` to unregister the chat). Any other
field in the body returns `400 INVALID_ARGUMENT` with
`Fields are not editable: <fields>` and the user document is left untouched, so a
payload that mixes an allowed field with a rejected one writes nothing.

This is a contract change: before, unknown fields were forwarded to the service and
`role` was silently dropped, which allowed writing verification, lockout and MFA
state without validation or an audit event. Security state now has dedicated support
routes: `POST /users/:id/unlock` and `POST /users/:id/verify`. `verified`,
`loginAttempts`, `lockoutUntil` and the MFA fields stay rejected by `PATCH`.

`email` and `password` are validated before they reach the service: the address is
trimmed and lower-cased, then checked against `EMAIL_REGEX`, so an invalid value
returns `400 Invalid email format` and an address already used by another user
returns `400 ENTITY_ALREADY_EXISTS`. A `password` that is empty or fails the
password policy (8+ characters with upper case, lower case, a digit and a symbol)
returns `400 INVALID_ARGUMENT`, matching signup and password reset. Changing the
email still does not trigger a verification flow: the account keeps its current
`verified` flag.

### Listing contract

`GET /users`, `GET /applications`, `GET /audit-events` and
`GET /applications/:applicationId/members` share one listing contract. The
member listing counts only members whose user still exists: an orphan grant is
excluded from both `items` and `total`.

| Parameter | Meaning                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `page`    | 1-based page number (default `1`).                                                                                                                   |
| `limit`   | Accepted range `1..100` (default `20`; `50` for audit events). Larger values are clamped to `100`; `0`, negative or non-numeric values return `400`. |
| `q`       | Case-insensitive prefix search. Users: `email`, `username`. Applications: `name`, `slug`. Audit: `email`, `event`, `audience`.                       |
| `sort`    | `field`, `field:asc`, `field:desc` or `-field`; `_id` is appended as a stable tie break.                                                             |

Sortable fields: users `email`, `username`, `role`, `verified`, `createdAt`;
applications `name`, `slug`, `audience`, `active`, `createdAt`; audit events
`createdAt`. Without `sort`, users and audit events order by `createdAt` descending
while applications order by `name` ascending.

```bash
curl -s "http://localhost:3000/users?page=1&limit=20&q=ali&sort=email:asc" \
  -H "Authorization: Bearer $OWNER_TOKEN"
```

```json
{
  "items": [
    { "_id": "65f1c0a2b7d4e90012a3b4c6", "email": "alice@example.com" }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

**Breaking change:** `GET /users` and `GET /applications` used to return a bare
array and now return this envelope; read `items` instead of indexing the body
directly. `GET /audit-events` also returns the envelope and no longer stops at a
fixed 200 events: walk it with `page`/`limit` (the total is stable for a static
snapshot). `GET /applications/:applicationId/grants` is still unpaginated.

### Audit

| Method | Route           | Access | Notes                                                                                             |
| ------ | --------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `GET`  | `/audit-events` | Owner  | Filters by `userId`, `email`, `applicationId`, `event`, `from`, `to`; paginated envelope (above). |

## Deployment

### Production image

The `Dockerfile` builds a production artifact and runs it with Node, not `tsx watch`:

```sh
docker build -t auth-service .
docker run --rm -p 3000:3000 --env-file .env auth-service
```

The build stage typechecks (`pnpm build`) and bundles `src/index.ts` with esbuild into
`dist/index.js`; runtime dependencies only, the mail templates and `package.json` are
copied into the final image. The container runs as the `node` user (not root) and has a
`HEALTHCHECK` against `/health`.

The image already defines `NODE_ENV=production`, `HOST=0.0.0.0` and
`TEMPLATES_PATH=./src/mail/templates`, and `--env-file .env` overrides any of them that
the file sets. `.env.example` targets local development, so a production `.env` must set
`NODE_ENV=production`, real `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`, a real
`MFA_SECRET_ENCRYPTION_KEY`, production `PUBLIC_APP_URL`/`CORS_ORIGINS` and either omit
`HOST` or set `HOST=0.0.0.0`.

`MONGO_URI` and `JWT_PRIVATE_KEY` are required: if either is missing the process exits
with a clear `InvalidArgumentError` instead of starting partially. Ephemeral JWT keys are
rejected when `NODE_ENV=production`.

### Trust Proxy

When running behind a reverse proxy (e.g., Nginx, Cloudflare, AWS ALB), you **must** enable Express trust proxy so that `req.ip` reflects the real client IP from `X-Forwarded-For`. Set the `TRUST_PROXY` environment variable to the number of proxy hops (`1` for a single reverse proxy) or `true`:

```sh
TRUST_PROXY=1
```

The default is `false`. Without this setting, IP/UA session tracking will record the proxy's IP address instead of the actual client IP. Prefer a specific hop count over `true` for tighter security.

Only `true`, `false` or a non-negative integer hop count are accepted. Any other value (for example `10.0.0.0/8`, `1.5`, `1e3` or a typo) aborts startup with an `Invalid TRUST_PROXY value` error instead of silently falling back to `false`.

### Owner bootstrap

Set `OWNER_EMAIL` and `OWNER_PASSWORD` to provision the single home owner. Startup runs it idempotently after connecting to MongoDB, or run it on demand:

```sh
OWNER_EMAIL=owner@home.example OWNER_PASSWORD='...' pnpm bootstrap:owner
```

The owner administers `/applications` and `/users`. Application administrators (grants with role `admin`) can manage permissions only for their own application. Re-running the bootstrap with the same email is a no-op: it never rotates the password or creates a second owner.

### Application login

`POST /auth/login` takes `email`, `password` and an optional `application` (slug or
audience). With an application, the account needs an active grant on it and receives
access and refresh tokens carrying that app's `aud` and the grant role
(`viewer`/`editor`/`admin`). Without an application, only the global owner can log in;
the owner token has no `aud` and is the only one accepted by `/applications` and
`/users`. An unknown or inactive app returns the same generic `401` as wrong
credentials (the password is verified first), a missing grant returns `403` without
tokens, and invalid credentials always return that same generic `401`.

### Application lifecycle

`GET /applications/:id` is readable by the owner and by the admin of that application.
The route accepts the global owner token and app-scoped tokens, and only the `admin`
grant authorizes the read. An application admin asking for another application, a user
with a `viewer` or `editor` grant and an id that does not exist all receive the same
`404`, so the route cannot be used to enumerate applications. Because the read resolves
the application with `findAssignableById`, an archived application answers `404` to its
admin too; the owner keeps reading it.

The owner renames an application with `PATCH /applications/:id { "name": "..." }` and
activates or deactivates it with `PATCH /applications/:id { "active": false }`. Only
`name` and `active` are mutable: sending `slug`, `audience`, `id` or `__v` returns `400`
and writes nothing, because the slug and the audience identify the application in every
issued token. An empty payload, a blank name (`Name is required`), a non-string name
(`Name must be a string`) or a non-boolean `active` also returns `400` without writing.

`DELETE /applications/:id` archives the application instead of deleting it: it sets
`active` to `false`, keeps the document and its grants, and is idempotent, so calling it
again still returns `200`. There is no physical deletion, and repeating the call does not
duplicate the `application.archived` audit event.

Archiving keeps every grant, so the owner keeps administering them: `PUT`,
`GET /applications/:applicationId/grants`, `GET /applications/:applicationId/grants/:userId`
and `DELETE /applications/:applicationId/grants/:userId` keep working on an archived
application. The application admin does not keep working: the grant surface resolves the
application with `findAssignableById` for any non-owner caller, so an archived
application answers `403` to its admin and to every app-scoped token. Neither the
archive nor the deactivation revokes existing grants.

Deactivating or archiving does not revoke live sessions or already issued access tokens;
the refresh endpoint stops minting new tokens, revokes the session that attempted it and
reactivating the application restores the login (not that revoked session). Every
transition is audited as `application.updated`, `application.activated`,
`application.deactivated` or `application.archived` with the acting user and the
application id.

### Session profile and introspection

`GET /auth/me` returns the authenticated identity (`id`, `email`), the application
(audience or `null`) and the role and expiration of the presented token. Apps expose it
to their own frontends after validating the JWT.

`GET /auth/context` is the single bootstrap read for the panel: the caller's minimal
identity (`id`, `email`, `verified`, `mfaEnabled`), the account's global role and every
application the caller can act on. The owner receives the whole catalog with
`role: "owner"`, even when the presented token is application-scoped; any other user
receives only the active applications where it holds a grant, with that grant's role.
A user without grants gets an empty list, so the response never distinguishes "unknown
application" from "no access". Applications are returned in a stable `name`/`slug`
order. The endpoint reads only the bearer's data: no sessions, settings, other users,
MFA secrets, password hashes or lockout counters, and it neither issues nor refreshes
tokens.

```json
{
  "user": {
    "id": "665f1f1f1f1f1f1f1f1f1f1f",
    "email": "admin@example.com",
    "verified": true,
    "mfaEnabled": false
  },
  "role": "user",
  "applications": [
    {
      "id": "665f2a2a2a2a2a2a2a2a2a2a",
      "name": "Panel",
      "slug": "panel",
      "audience": "panel",
      "active": true,
      "role": "admin"
    }
  ]
}
```

`POST /auth/introspect` takes `{ "token": "..." }` and requires a valid access token as
the caller. It answers `{ "active": true, ... }` only for the caller's own tokens in the
same application; revoked, expired or foreign tokens return `{ "active": false }`
without any extra data.

### Device sessions

Every login creates an independent session; logging in from another device no longer
ends the previous one. `GET /auth/sessions` lists the user's active sessions with the
device (user-agent), application, IP, creation time and last activity, and
`DELETE /auth/sessions/:sessionId` revokes one session without touching the rest
(repeating it is a no-op), and `DELETE /auth/sessions` revokes them all. The oldest
sessions beyond `MAX_SESSIONS_PER_USER` (default `50`) are revoked on each new login.

Revoking a session invalidates its refresh token; an access token already issued keeps
working until it expires (`JWT_EXPIRATION`, one hour by default). Use `POST /auth/logout`
to also blacklist the caller's current access token.

### Shareable invitations and password resets

The owner (or an app admin for its own application) can create a single-use invitation
for an email, application and role:

```
POST /applications/:applicationId/invitations   { "email": "...", "role": "editor" }
```

The response contains a link like `https://<PUBLIC_APP_URL>/invitations/accept?token=...`
that the owner shares through any channel. The guest sets a password at
`POST /auth/invitations/accept` and gets the granted role. Existing users and holders
cannot be invited: use grants to give them access to another application.

Password resets can be generated and shared the same way:

```
POST /auth/password-reset-links            { "userId": "..." }   (owner only)
POST /auth/password-reset-links/accept     { "token": "...", "newPassword": "...", "passwordConfirmation": "..." }
```

Links are hashed at rest, expire (`INVITATION_LINK_EXPIRATION_MS`, default 7 days;
`PASSWORD_RESET_LINK_EXPIRATION_MS`, default 1 hour) and can be used only once.
`/auth/forgot-password` stays available and never reveals whether an email exists.

### Audit log

The service records login successes/failures, lockouts, refreshes, logouts, session
revocations, grant changes and application lifecycle transitions in the `AuditEvent`
collection. Events carry identifiers and request metadata only (never passwords, tokens,
codes or links) and are kept for `AUDIT_RETENTION_DAYS` (default 90) through a TTL index.

The owner can query them:

```
GET /audit-events?userId=...&applicationId=...&event=login.succeeded&from=2026-01-01&to=2026-02-01
```

### Telegram link notifications

Set `TELEGRAM_BOT_TOKEN` to deliver invitation and reset links through a Telegram bot.
`TELEGRAM_OWNER_CHAT_ID` is the owner fallback chat; when it is unset the service uses
the `telegramChatId` of the owner user. An invitation can include an optional
`telegramChatId` for the guest, used only to deliver that invitation and never stored on
the created account. Delivery is best effort with `TELEGRAM_TIMEOUT_MS` (default 3000):
failures never fail link creation and the response still contains the copyable link,
with `notification.delivered` set to `false`. Configure a user's chat with
`PATCH /users/:id { "telegramChatId": "4242" }` (owner only). Links, tokens and chat ids
are never logged.

### Multi-factor authentication (TOTP)

Users can enable TOTP from any authenticator app:

```
POST /auth/mfa/enroll     { "password": "..." }        -> { secret, otpauthUrl }
POST /auth/mfa/activate   { "code": "123456" }         -> { recoveryCodes: [...] }
```

Once enabled, `POST /auth/login` returns
`{ "mfaRequired": true, "challengeToken": "...", "expiresIn": 300 }` instead of tokens.
Submit the challenge and a TOTP or recovery code to `POST /auth/mfa/verify`
(`{ "mfaToken": "...", "code": "..." }`) to receive the access and refresh tokens. The
challenge is a short-lived JWT (`MFA_CHALLENGE_EXPIRATION`) signed with the reserved
`auth-service:mfa` audience, so it cannot be used as a Bearer token or accepted by
consumers that verify the application audience. TOTP secrets are encrypted at rest
with `MFA_SECRET_ENCRYPTION_KEY` (base64-encoded 32-byte key); without it they fall
back to the legacy plaintext format.

`POST /auth/mfa/disable` requires the current password plus a TOTP or recovery code.
Repeated invalid codes lock the MFA challenge using `MAX_LOGIN_ATTEMPTS` and
`LOCKOUT_DURATION_MS` with dedicated counters. Recovery codes are returned once, stored
only as SHA-256 hashes and consumed atomically. TOTP secrets are stored server-side and
never serialized or logged.

### JWT signing keys

Access tokens are signed with RS256. Consumers verify them with the public keys published at `GET /.well-known/jwks.json` (cacheable, never includes private material). Configure the active key with:

```sh
JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
JWT_KEY_ID="2026-11"
JWT_ISSUER=auth-service
```

`JWT_PUBLIC_KEY` is derived from the private key when omitted, and `JWT_KEY_ID` defaults to the RFC 7638 thumbprint of the public key. When no keys are configured the service refuses to start unless `JWT_ALLOW_EPHEMERAL_KEYS=true` is set explicitly, which is only appropriate for local development and tests: every process generates its own pair, so tokens and JWKS differ between replicas. `NODE_ENV=production` rejects ephemeral keys even with the flag set. `JWT_PUBLIC_KEY` without `JWT_PRIVATE_KEY` is always rejected.

To rotate, add the previous public keys to `JWT_RETIRED_PUBLIC_KEYS` as JSON on every instance, deploy the new active key, wait for the maximum token TTL (`JWT_REFRESH_EXPIRATION` by default) and then remove the retired entries. Every entry needs its original `kid`; the service does not derive it. The optional `publishedAt` records when the key was published and is reported by the status endpoint:

```sh
JWT_KEY_PUBLISHED_AT='2026-11-04T09:00:00.000Z'
JWT_RETIRED_PUBLIC_KEYS='[{"kid":"2026-10","publicKey":"-----BEGIN PUBLIC KEY-----\n...","publishedAt":"2026-10-01T09:00:00.000Z"}]'
```

`GET /jwks/status` is owner-only and answers `{ "activeKid": "...", "keys": [{ "kid": "...", "status": "active|retired", "publishedAt": "..." }] }` with `Cache-Control: no-store`. It never includes private material and has no write counterpart. See `docs/runbooks/jwt-key-rotation.md` for the complete procedure, the grace period and the rollback.

`JWT_SECRET` is only a migration bridge: it verifies legacy HS256 tokens that carry no audience. Remove it once every HS256 access and refresh token has expired. See `docs/implementations/2026-11-02-rs256-jwks.md` for the design of the keyring.

### Health checks

- `GET /health` — liveness, does not depend on MongoDB.
- `GET /ready` — readiness, returns `503` when MongoDB is not connected.

Both probes are exempt from the global rate limiter and are not written to the request log, so a container health check cannot throttle itself or flood the log. They report the readiness of the injected `Database` connection, not the `mongoose` module singleton.

On `SIGTERM` or `SIGINT` the server stops accepting connections, finishes in-flight requests and closes the database connection. The server close is bounded by a 10s timeout, a second signal forces `exit(1)`, and any failure is logged before the process exits with code `1`.

### CORS

Set `CORS_ORIGINS` to a comma-separated list of allowed browser origins. When unset, no origin is allowed:

```sh
CORS_ORIGINS=http://localhost:5173,https://auth.home.example
```

Entries are normalized before comparison (trailing slashes, casing and default ports are ignored). Wildcards and entries with a path, query, fragment or credentials are rejected at startup so a misconfiguration fails fast.

Every response also gets the standard `helmet` security headers and the `X-Powered-By` header is removed.
