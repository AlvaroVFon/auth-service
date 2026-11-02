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
