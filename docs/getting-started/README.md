# Getting started

This guide is for people who integrate the API without knowing the codebase. It
explains the domain, prepares a local instance and walks through the three flows
an application needs, in order. Every flow is a short page with a Mermaid
diagram, copyable `curl` commands and the expected responses.

## What the service does

`auth-service` is the authentication and authorization backend for the
applications of a single home. It stores users, applications and permissions in
MongoDB, and it issues RS256 access tokens that applications verify with the
public keys published at `GET /.well-known/jwks.json`.

One deployment serves several applications. Accounts are global, while access is
decided by a per-application grant, so the same user can be an `editor` in one
application and have no access to another.

## Concepts

| Concept       | Meaning                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner         | The single global administrator, provisioned from `OWNER_EMAIL`/`OWNER_PASSWORD`. Logs in without an application and manages users, applications and the audit log. |
| Application   | A client of the service with a `slug` (human identifier) and an `audience` (the `aud` claim). Both are accepted as the `application` on login.                      |
| Grant         | The role an account has on one application: `viewer`, `editor` or `admin`. Without a grant the account cannot log in with that application.                         |
| Holder        | A temporary signup record that exists while the email is being verified. It is not a user and cannot log in.                                                        |
| User          | A verified account. Global: it can hold grants on several applications.                                                                                             |
| Session       | One login on one device, represented by a refresh token. Every login is an independent session.                                                                     |
| Access token  | Short-lived RS256 JWT (`type: access`) with the user id, the grant role and, for application tokens, the `aud`.                                                     |
| Refresh token | Longer-lived JWT (`type: refresh`) with a `jti` stored server-side. It is single-use and rotates on every refresh.                                                  |

## Access levels

Routes belong to one of four levels, and they do not mix: an application token
is not accepted where an owner token is required.

| Level         | Meaning                                                     | Example routes                                                                                                                  |
| ------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Public        | No token.                                                   | `/health`, `/ready`, `/.well-known/jwks.json`, `/auth/signup`, `/auth/login`, `/auth/refresh`, `/auth/mfa/verify`               |
| Authenticated | Any valid access token, owner or application.               | `/auth/me`, `/auth/introspect`, `/auth/logout`, `/auth/sessions`, `/auth/mfa/enroll`, `/auth/mfa/activate`, `/auth/mfa/disable` |
| Owner         | The global owner only.                                      | `/users`, `/applications`, `/audit-events`, `/auth/password-reset-links`                                                        |
| App admin     | The owner or a grant with role `admin` on that application. | `/applications/:applicationId/grants`, `/applications/:applicationId/invitations`                                               |

The [API reference](../../README.md#api-reference) marks the level of every
route.

## Prepare a local instance

Prerequisites: Node.js 22+, pnpm and Docker (for MongoDB and MailHog).

```bash
cp .env.example .env
# uncomment OWNER_EMAIL and OWNER_PASSWORD in .env
pnpm install
docker-compose up -d
pnpm dev
```

`docker-compose` starts MongoDB on `localhost:27017` and MailHog (SMTP
`localhost:1025`, web UI <http://localhost:8025>). `.env.example` already points
there and carries safe local values for the JWT keys, the MFA encryption key and
the rate limits.

The owner is only provisioned when both variables are set, so uncomment them
before starting the service:

```dotenv
OWNER_EMAIL=owner@home.example
OWNER_PASSWORD=ChangeMe123!
```

`OWNER_PASSWORD` needs 8+ characters with a lowercase letter, an uppercase
letter, a digit and a symbol; otherwise startup fails with
`Password does not meet complexity requirements`. Provisioning is idempotent:
re-running with the same email never creates a second owner and never rotates
the password.

Check that the service is up:

```bash
curl -s http://localhost:3000/health
# {"status":"ok"}
```

`GET /ready` answers `200` once MongoDB is connected and `503` until then.

## The three flows

Run them in this order the first time. In a clean clone only the owner exists, so
the bootstrap always comes first.

| #   | Flow                                                               | What it covers                                                                        |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1   | [Bootstrap an application](application-bootstrap.md)               | The owner creates an application and gives an account access, by invitation or grant. |
| 2   | [Sign up and verify an email](signup-and-verification.md)          | Self-service account creation: holder, emailed code and verification.                 |
| 3   | [Log in, call the API and refresh the token](login-and-refresh.md) | Application login, authenticated call, refresh rotation and logout.                   |

The bootstrap page ends with a user that can log in. If you prefer the
self-service path, run the signup flow first, then grant that account access with
step 4b of the bootstrap page; you will need its `_id`, which the owner can read
from `GET /users?q=<email>` as `items[0]._id` (the listing returns the shared
`{ items, total, page, limit }` envelope, not a bare array). The login page
assumes both prerequisites are done.

After the three flows you have everything a frontend or backend needs to
authenticate users. The rest of the surface (MFA, device sessions, invitations,
password resets, audit) is documented in the
[API reference](../../README.md#api-reference).

## Keep in mind

- Access tokens are bearer credentials. Verify the signature with the JWKS,
  check the `aud` claim, and never expose an owner token to a client end users
  can inspect.
- Login, signup, forgot-password and refresh are rate-limited. The shipped
  `.env.example` uses short local windows, so repeating a flow quickly can
  return `429`; wait a few seconds or restart the stack.
- Authentication errors are intentionally generic: login does not reveal whether
  an email exists, and forgot-password always answers `204`. Do not build UI that
  depends on those differences.
- Every value in these documents is a local demo value. Tokens, codes and
  passwords in the examples are placeholders, not credentials.

## More

- [Postman collection](../../postman/README.md): 61 runnable requests that follow
  these flows and cover the rest of the API.
- [API reference](../../README.md#api-reference): every route with its access
  level, plus deployment notes.
