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

### Health checks

- `GET /health` — liveness, does not depend on MongoDB.
- `GET /ready` — readiness, returns `503` when MongoDB is not connected.

Both probes are exempt from the global rate limiter and are not written to the request log, so a container health check cannot throttle itself or flood the log. They report the readiness of the injected `Database` connection, not the `mongoose` module singleton.

On `SIGTERM` or `SIGINT` the server stops accepting connections, finishes in-flight requests and closes the database connection. The server close is bounded by a 10s timeout, a second signal forces `exit(1)`, and any failure is logged before the process exits with code `1`.
