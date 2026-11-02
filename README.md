# Auth Service

Authentication and authorization service built with Express 5, Mongoose, and TypeScript.

## Features

- User registration and signup with email verification
- JWT-based authentication (access + refresh tokens)
- Access token blacklist (revoke before expiry)
- Session tracking (IP address and user-agent on refresh tokens)
- Password reset flow
- Account lockout after failed login attempts
- Per-route rate limiting
- Role-based authorization (user / admin)
- Home applications with per-user roles (viewer, editor, admin)
- Login scoped to a concrete application (audience + grant role)
- Session profile (`GET /auth/me`) and token introspection (`POST /auth/introspect`)
- Refresh rotation with the refresh token alone, even after the access token expired
- Independent device sessions with listing and selective revocation
- Shareable, single-use invitation and password-reset links (no SMTP required)
- Owner-only audit log of authentication and permission events
- TOTP multi-factor authentication with single-use recovery codes

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

Copy `.env.example` to `.env` and fill it in before starting. `MONGO_URI` and
`JWT_PRIVATE_KEY` are required: if either is missing the process exits with a clear
`InvalidArgumentError` instead of starting partially. Ephemeral JWT keys are rejected
when `NODE_ENV=production`.

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
`/users`. A missing grant, unknown app or inactive app returns `403` without tokens,
while invalid credentials always return the same generic `401`.

### Session profile and introspection

`GET /auth/me` returns the authenticated identity (`id`, `email`), the application
(audience or `null`) and the role and expiration of the presented token. Apps expose it
to their own frontends after validating the JWT.

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
revocations and grant changes in the `AuditEvent` collection. Events carry identifiers
and request metadata only (never passwords, tokens, codes or links) and are kept for
`AUDIT_RETENTION_DAYS` (default 90) through a TTL index.

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

To rotate, add the previous public keys to `JWT_RETIRED_PUBLIC_KEYS` as JSON on every instance, deploy the new active key, wait for the maximum refresh-token TTL and then remove the retired entries. Every entry needs its original `kid`; the service does not derive it:

```sh
JWT_RETIRED_PUBLIC_KEYS='[{"kid":"2026-10","publicKey":"-----BEGIN PUBLIC KEY-----\n..."}]'
```

`JWT_SECRET` is only a migration bridge: it verifies legacy HS256 tokens that carry no audience. Remove it once every HS256 access and refresh token has expired. See `docs/implementations/2026-11-02-rs256-jwks.md` for the full runbook.

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
