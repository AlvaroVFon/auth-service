# Postman collection

Runnable Postman assets for the full HTTP surface of the service: probes, JWKS,
signup and verification, owner and application login, refresh, sessions,
applications, users, grants, invitations, password resets, MFA (TOTP), audit and
access-control checks.

| File                                          | Purpose                                       |
| --------------------------------------------- | --------------------------------------------- |
| `auth-service.postman_collection.json`        | 61 requests grouped in 15 folders.            |
| `auth-service.local.postman_environment.json` | Local `baseUrl`, MailHog URL and owner creds. |

## Prerequisites

1. MongoDB and MailHog running (`docker-compose up -d`).
2. `.env` with `MONGO_URI`; `cp .env.example .env` works locally.
3. The owner provisioned: set `OWNER_EMAIL`/`OWNER_PASSWORD` in `.env` (startup
   is idempotent) or run:
   ```sh
   OWNER_EMAIL=owner@home.example OWNER_PASSWORD='ChangeMe123!' pnpm bootstrap:owner
   ```
4. The service listening on `http://localhost:3000` (`pnpm dev`).

## Import

1. Postman → **Import** → select both JSON files.
2. Pick the **Auth Service · local** environment.
3. Run the collection top to bottom, or folder by folder.

With Newman:

```sh
npx newman run postman/auth-service.postman_collection.json \
  -e postman/auth-service.local.postman_environment.json
```

Override values without editing files:

```sh
npx newman run postman/auth-service.postman_collection.json \
  -e postman/auth-service.local.postman_environment.json \
  --env-var ownerEmail=me@example.com --env-var ownerPassword='...' \
  --folder '02 · Owner session'
```

## What the run does

| Folder                               | Covers                                                                |
| ------------------------------------ | --------------------------------------------------------------------- |
| `00 · Probes and keys`               | `/health`, `/ready`, `/.well-known/jwks.json`                         |
| `01 · Signup and email verification` | `/auth/signup`, MailHog code extraction, `/auth/verify`               |
| `02 · Owner session`                 | owner login, `/auth/me`, introspection, refresh, session list         |
| `03 · Applications`                  | create, list and read applications                                    |
| `04 · Users`                         | create, list, read, patch (Telegram chat id)                          |
| `05 · Grants`                        | upsert `editor` → `admin`, list, read                                 |
| `06 · Application login`             | login with an application, scoped `/auth/me`, refresh, introspect     |
| `07 · Invitations`                   | create and accept an invitation, guest login and profile              |
| `08 · Password reset links`          | create and accept an owner-generated reset link, login again          |
| `09 · Forgot password · email code`  | forgot-password, MailHog code extraction, reset with the code         |
| `10 · Device sessions`               | second login, list sessions, revoke one session                       |
| `11 · MFA · TOTP`                    | enroll, activate, challenge login, verify, disable, login without MFA |
| `12 · Audit log`                     | recent events, filter by event, filter by user and date range         |
| `13 · Access-control checks`         | expected `401` denials and foreign-token introspection                |
| `14 · Cleanup · optional`            | revoke sessions, logout, delete the demo users                        |

Test scripts save every value the next request needs, so no manual copy/paste is
required except when MailHog extraction fails.

## Variables

The collection ships defaults; the environment overrides `baseUrl`,
`mailhogUrl`, `ownerEmail` and `ownerPassword`. The most important variables:

| Variable           | Filled by                              |
| ------------------ | -------------------------------------- |
| `accessToken`      | Owner login and refresh                |
| `refreshToken`     | Owner login and refresh (rotates)      |
| `appAccessToken`   | Application login, refresh, MFA verify |
| `applicationId`    | Create application                     |
| `userId`           | Create user / application profile      |
| `holderId`         | Signup                                 |
| `verificationCode` | MailHog verification email             |
| `resetCode`        | MailHog password reset email           |
| `invitationToken`  | Create invitation (parsed from `link`) |
| `resetToken`       | Create password reset link             |
| `sessionId`        | Session-listing requests               |
| `mfaSecret`        | MFA enroll                             |
| `mfaToken`         | MFA challenge login                    |
| `recoveryCode`     | MFA activate                           |

## Re-running

**03 · Applications → Create application** generates a fresh `runId`, slug,
audience and demo emails on every execution, then clears the previous run's
identifiers. That makes replays safe from duplicate-key errors. Applications
have no `DELETE` endpoint yet, so every run leaves one behind; delete them from
MongoDB if the catalogue grows.

## Local notes

- **MailHog**: the two `MailHog · ...` requests read
  `http://localhost:8025/api/v2/messages` and extract the 6-character code. This
  is best effort: if the email layout changes, copy the code into
  `verificationCode` or `resetCode` manually.
- **MFA**: codes are computed in the request pre-scripts with `crypto-js` from
  `mfaSecret`; no authenticator app is needed. Use `recoveryCode` instead of
  `mfaCode` in **Disable MFA** to consume a recovery code.
- **Rate limits**: the dev `.env.example` allows 15 logins, 15 signups, 10
  password resets and 20 refreshes per 5 seconds, plus a global limit of 100
  requests per 15 minutes per IP. One full run is below those limits; repeated
  runs can hit the global one.
- **Cleanup** revokes sessions, logs out and deletes the demo users. Skip it to
  keep the fixtures.
- The owner must not have MFA enabled when running folders 02 and 10, because
  both expect a token pair instead of an MFA challenge.
