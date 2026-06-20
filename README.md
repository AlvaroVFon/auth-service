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
- Multi-tenancy foundation

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

When running behind a reverse proxy (e.g., Nginx, Cloudflare, AWS ALB), you **must** enable Express trust proxy so that `req.ip` reflects the real client IP from `X-Forwarded-For`:

```ts
app.set('trust proxy', true);
```

Without this setting, IP/UA session tracking will record the proxy's IP address instead of the actual client IP. For production, consider setting a specific hop count (`trust proxy: 1` for a single proxy) instead of `true` for tighter security.
