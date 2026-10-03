---
date: '2026-10-03'
slug: 'module-design-review'
status: 'review'
scope: 'whole-repository'
---

# Module Design Review — auth-service

## Scope & Method

Review of module boundaries across `src/`, evaluated against four gates:

1. **Deep modules** — only the public/exported surface counts.
2. **Information hiding** — one home per design decision, no leakage.
3. **Pull complexity downwards** — absorb complexity; no configuration/exceptionitis pushed to callers.
4. **Split or merge** — split only when total complexity decreases.

The unit of analysis is the **domain module** (`users/`, `auth/`, `holders/`, `tenants/`) and the
**infrastructure libs** (`libs/*`). Findings are stated at two granularities: **macro** (module
boundary) and **micro** (artifacts).

### Structural facts that frame everything

- There are **no barrel entry points** per module. The de-facto "public surface" is whatever file a
  consumer happens to import: `users/users.service.ts`, `holders/holders.service.ts`,
  `auth/tokens/blacklist.service.ts`, etc.
- `*.module.ts` is **not** a module facade. It only builds controllers and registers routes; its
  collaborators are passed in from the global composition root and its fields
  (`AuthModule.service`, `.controller`, `.tenantsController`) are never read outside the class.
- `src/config/bootstrap.ts` is the _only_ composition root in production; `test/utils/app.ts`
  duplicates the entire wiring by hand.

---

## Module Inventory & Responsibility

| Module                  | Artifacts                                          | Responsibility (one sentence)                              | Surface                             |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------- |
| `users/`                | service, controller, router, schema, interface     | CRUD + credential/account lifecycle for a user.            | `UsersService` (8 methods)          |
| `auth/`                 | module, router, 2 controllers, 2 services          | Authenticate a principal and issue/rotate/revoke sessions. | `AuthService` (7 methods)           |
| `auth/codes/`           | service, schema, interface                         | Issue/validate one-time codes (signup, reset).             | `CodesService` + `CodesModel`       |
| `auth/tokens/`          | 2 services, 2 schemas, 2 interfaces, ctx type      | Persist refresh tokens and blacklisted access tokens.      | 2 services + 2 models               |
| `holders/`              | service, schema, interface                         | Staging identity before email verification.                | `HoldersService` (4 methods)        |
| `tenants/`              | service, schema, interface (misspelled `tentants`) | Look up a tenant by id.                                    | `TenantsService.findById`           |
| `libs/jwt`              | service, errors, enum, interfaces                  | Sign/verify JWTs.                                          | `JwtService` (concrete, no port)    |
| `libs/crypto`           | service                                            | Hash/compare passwords (bcrypt).                           | `CryptoService` (concrete, no port) |
| `libs/logger`           | interface + winston adapter                        | Structured logging.                                        | `LoggerInterface` (good port)       |
| `libs/mailer`           | interface + nodemailer adapter                     | Send transactional emails.                                 | `MailerInterface` (business-aware)  |
| `libs/templates-engine` | interface + handlebars adapter                     | Render templates.                                          | `TemplateRenderer` (good port)      |
| `libs/config-service`   | interface + mongo adapter + schema                 | Dynamic config entries.                                    | **Not wired in production**         |

**Boundary verdict per module** is in the Depth Verdicts table below.

---

## Cross-Module Leakage (the dominant problem)

There is no enforced module boundary, so every feature module reaches into the internal files of
its neighbours. Verified edges:

| From                                                    | Imports                                          | Kind                                            |
| ------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `src/users/users.service.ts:9`                          | `holders/holders.interface`                      | users → holders internal                        |
| `src/auth/auth.module.ts:5,10`                          | `holders/holders.service`, `users/users.service` | auth → holders, auth → users internal           |
| `src/auth/services/auth.service.ts:17-23`               | `holders/*`, `users/*`                           | auth → holders, auth → users internal           |
| `src/auth/services/auth-tenant.service.ts:6`            | `tenants/tenants.service`                        | auth → tenants internal                         |
| `src/common/middlewares/authentication.middleware.ts:3` | `auth/tokens/blacklist.service`                  | **common → auth internal (layering inversion)** |
| `src/auth/codes/codes.schema.ts:8`                      | `ref: 'Holder'` (string)                         | back-door coupling to holders' model name       |
| `src/auth/tokens/*.ts`                                  | `libs/jwt/token-types.enum`                      | deep infra-file import, not a lib entry point   |

The composition root importing internals is acceptable (that is its job). The problem is that
**there is no stable contract to import instead**: a consumer cannot depend on `auth` without
depending on `auth/tokens/blacklist.service`'s concrete class.

### Leakage classification

- **Interface leakage**
  - `JwtService.verifyToken(): JwtPayload | string` exposes `jsonwebtoken`'s type, forcing casts in
    callers (`auth.service.ts:85,261,282`, `authentication.middleware.ts:27,53`).
  - `UsersService.findById(): Promise<UserInterface | null>` and `HoldersService.findById(): Promise<Holder>`
    disagree on the same failure contract (see below).
  - `WinstonLogger.logger` is a public field exposing the concrete `winston.Logger`.
- **Back-door leakage**
  - `CODE_EXPIRATION_MS` drives both `holders` expiry (`holders.schema.ts:6`) and code expiry
    (`codes.service.ts:19`) — two unrelated concepts sharing one undeclared assumption.
  - `CodesModel` is referenced by string `ref: 'Holder'` and indexed on the wrong field (below).
  - Hardcoded URLs `https://ourservice.com/...` inside `AuthService` (`:164,191`) leak a deployment
    concern into the domain service.

---

## Duplicated Knowledge

| Knowledge                                   | Appears in                                                                         | Should live in                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------- |
| `EMAIL_REGEX` validation                    | `users.service.ts:23,60`, `holders.service.ts:25,51`, `auth.service.ts:53,122,174` | one email value object / validator |
| `OBJECTID_REGEX` validation                 | 16 call sites across users, holders, tenants, codes, refresh-token, auth           | one `assertObjectId` helper        |
| Email-existence lookup (`findOne({email})`) | `users.service.ts:32,47`, `holders.service.ts:37`, `auth.service.ts:142,146`       | owned by each service, called once |
| Password hashing                            | `users.service.ts:30,99`, `holders.service.ts:42`                                  | a credential collaborator          |
| Refresh-token issuance sequence             | `auth.service.ts:80-94` **and** `:279-293` (login & refresh)                       | one private `issueSession()`       |
| Code lookup by `(holderId,type,used)`       | `codes.service.ts:37-42` and `:87-91`                                              | one private finder                 |
| `PASSWORD_REGEX` policy                     | `holders.service.ts:31`, `auth.service.ts:128,210`                                 | one password-policy value object   |

Change amplification is real: changing the ID-validation rule or the email format forces edits in
five-plus files.

---

## Pull-Complexity-Downwards Findings

- **Exceptionitis / contract mismatch.** `UsersService.findById` and `HoldersService.findById`
  _throw_ `EntityNotFoundError` on miss, but callers still re-check the (impossible) `null` result:
  `auth.service.ts:224-227`, `:240-243`, `:274-277` are **dead branches**. The return type
  `Promise<X | null>` advertises a contract the implementation never honours. Pick one: either
  return `null` and let the caller decide, or throw and drop the checks — not both.
- **Over-configuration in `AuthService`.** `maxLoginAttempts` and `lockoutDurationMs` are injected as
  constructor scalars. They are genuine policy and belong at the composition root — acceptable —
  but they are two of **ten** constructor parameters, which makes the class a magnet for policy.
- **Derived data pushed to the caller.** `AuthService` signs a token and then immediately
  `verifyToken()`s its own output to read `jti`/`exp` (`:85`, `:282`). The token metadata is a value
  the module already has; the caller pays a round-trip and a `as JwtPayload` cast. `JwtService` is
  the right place to return `{ token, jti, expiresAt }`.
- **Unused abstraction.** `libs/config-service` defines a clean `ConfigService` port with **zero
  production wiring** — dead design with maintenance cost.

---

## Pass-through / Shallow Artifacts (micro)

| Artifact                                                                                | Signal                                                                              |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `TenantsService.findById` (`tenants.service.ts:10`)                                     | Signature ≈ body: a bare `findById().lean().exec()`.                                |
| `CodesService.createSignupCode` / `createForgotPasswordCode` (`codes.service.ts:58-64`) | 1:1 wrappers over `create`.                                                         |
| `JwtService.generateAccessToken` / `generateRefreshToken` (`:61,66`)                    | 1:1 wrappers over `generateToken`.                                                  |
| `AuthService.handleFailedLogin` / `handleSuccessfulLogin` (`:103,111`)                  | One-line forwarders; acceptable as intent-revealing names, but note they add a hop. |
| Controllers (`auth.controller.ts:17-88`, `users.controller.ts`)                         | Thin delegates — correct for HTTP; not a design smell.                              |

Pass-through wrappers are only a smell when they add **no boundary value**. The code/token wrappers
above hide no complexity; `JwtService.generateTokens` is the one that earns its keep by composing.

---

## Depth Verdicts

### Macro — module boundary

| Module                                      | Verdict                   | Evidence (caller observation)                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `auth`                                      | **shallow**               | To perform signup, `AuthModule` must import and receive `UsersService`, `HoldersService`, `CodesService`, `MailerInterface`, `JwtService`, `CryptoService`, `RefreshTokenService`, `BlacklistService` — 8 collaborators. |
| `users`                                     | **acceptable**            | Cohesive CRUD, but leaks `Holder` into its own service (`users.service.ts:40`).                                                                                                                                          |
| `holders`                                   | **shallow**               | A staging clone of `users`; duplicates validation and has a 4-method surface almost identical to a subset of `UsersService`.                                                                                             |
| `tenants`                                   | **shallow**               | One-operation module; `findById` is a pass-through.                                                                                                                                                                      |
| `auth/codes`                                | **acceptable (internal)** | Genuinely hides code generation/validation, but exposes its `CodesModel` to the global root.                                                                                                                             |
| `auth/tokens`                               | **acceptable (internal)** | Hides rotation/blacklist logic; leaks `BlacklistService` across layers.                                                                                                                                                  |
| `libs/logger`, `mailer`, `templates-engine` | **deep**                  | Clean ports; adapters are swappable.                                                                                                                                                                                     |
| `libs/jwt`, `libs/crypto`                   | **shallow**               | No port; concrete class + third-party types cross every boundary.                                                                                                                                                        |

### Micro — artifacts

| Artifact                          | Verdict        | Evidence                                                                                                                    |
| --------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `AuthService`                     | **acceptable** | Hides lockout, rotation and verification behind 7 methods, but re-verifies its own tokens and repeats the session sequence. |
| `UsersService` / `HoldersService` | **shallow**    | Each method re-validates format inline; interface ≈ body.                                                                   |
| `JwtService`                      | **shallow**    | `generate*` wrappers + `verifyToken` returns a foreign type.                                                                |
| `TenantsService`                  | **shallow**    | Wrapper.                                                                                                                    |

### Caller snippets

Smallest realistic external usage today:

```ts
// Composition root — the "caller" has to know 8 collaborators to build auth.
const authModule = new AuthModule(
  usersModule.service,
  cryptoService,
  jwtService,
  winstonLogger,
  mailService,
  codeService,
  authenticationMiddleware,
  refreshTokenService,
  blacklistService,
  holdersService,
  authTenantService,
  MAX_LOGIN_ATTEMPTS,
  LOCKOUT_DURATION_MS,
  rateLimitConfig,
);
```

```ts
// Cross-module consumer — must import an internal file of another module.
import { BlacklistService } from '../../auth/tokens/blacklist.service';
```

```ts
// Domain flow — the caller sequences steps that belong to the token module.
const { accessToken, refreshToken } = this.jwtService.generateTokens(id, role);
const decoded = this.jwtService.verifyToken(refreshToken) as JwtPayload;
await this.refreshTokenService.revokeAllByUserId(id);
await this.refreshTokenService.create(
  id,
  decoded.jti as string,
  new Date(decoded.exp! * 1000),
  ctx,
);
```

The third snippet is the tell: issuing a session takes four calls in a fixed order plus a cast.
That orchestration belongs inside one module.

---

## Split / Merge Decisions

| Question                                                | Decision                                     | Rationale (net complexity)                                                                                                                                                                      |
| ------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Are `auth/codes` and `auth/tokens` independent modules? | **Keep as internal artifacts of `auth`**     | They are collaborators, not standalone domains. Do **not** promote them to modules; instead hide their models behind `auth` and stop exposing `CodesModel`/`*TokenModel` at the root.           |
| `holders` vs `users`                                    | **Keep separate, but stop duplicating**      | They represent different lifecycle stages (unverified vs verified). Merging would entangle verification state with the canonical user. Extract the shared validation/credential policy instead. |
| `tenants` as its own module?                            | **Keep, but co-locate or wait**              | It is currently one pass-through method; as multi-tenancy activates it earns the boundary. Revisit when a second operation appears.                                                             |
| `libs/config-service`                                   | **Merge into nothing / delete until needed** | An unwired abstraction is pure cost. Delete or wire it; do not keep a dead port.                                                                                                                |
| Session issuance (the 4-call sequence)                  | **Merge into one operation**                 | Conjoined by knowledge (issuance always pairs with persistence). Expose `issueSession(user)` returning tokens and persisting the refresh record.                                                |

---

## Failure Contract Issues

The module set has **inconsistent** failure contracts for the same concept:

| Operation                   | Contract today                                     | Problem                                                                                                      |
| --------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `UsersService.findById`     | throws `EntityNotFoundError`                       | Declared return type says `\| null`; callers write dead `if (!user)` branches.                               |
| `HoldersService.findById`   | throws `EntityNotFoundError`                       | Inconsistent with the `\| null` convention of `findByEmail`.                                                 |
| `TenantsService.findById`   | returns `null`                                     | The only "not found = null" finder.                                                                          |
| `CodesService.validateCode` | throws                                             | Fine, but its message taxonomy is internal.                                                                  |
| `JwtService.verifyToken`    | throws `InvalidTokenError` **or** returns `string` | The union forces callers to cast; a domain result type (`{ userId, role, jti, exp }`) would remove the cast. |

**Recommendation:** one convention — finders return `T | null`; mutating/validating operations throw
domain errors. Then delete the dead branches in `AuthService`.

---

## Latent Defect Found

`src/auth/codes/codes.schema.ts:20`

```ts
CodesSchema.index({ userId: 1, type: 1, used: 1 });
```

The document field is `holderId` (`:8`), **not** `userId`. Mongo will create an index on a
non-existent path, so the intended `(holderId, type, used)` lookup is unindexed. Rename to
`holderId`.

---

## Improvements (prioritized)

1. **Give each module a real facade.** Add `users/index.ts`, `auth/index.ts`, etc. that export only
   the service interface + public DTOs. Forbid cross-module imports of internal files. Fix the
   `common → auth/tokens` inversion by injecting a `TokenBlacklistPort` instead of `BlacklistService`.
2. **Fix finder contracts.** Standardize on `T | null`; remove dead `if (!user)` branches in
   `AuthService`.
3. **Introduce ports for `jwt` and `crypto`.** `JwtService.verifyToken` should return a domain
   payload, not `JwtPayload | string`. `CryptoService` should be typed as `PasswordHasher`.
4. **Collapse session issuance into one operation** (`issueSession`) to remove the duplicated
   `generate → verify → revoke → create` sequence and the `as JwtPayload` casts.
5. **Single home for validation policy.** Extract `assertObjectId`, email format and password policy
   into shared value objects; remove the 16+ duplicated guards.
6. **Delete dead design.** `libs/config-service` (unwired), `CreateCodeDTO`, unreferenced exports
   (`CodesSchema`, `ConfigEntrySchema`, `RefreshTokenService.findAllActiveByUserId`,
   `JwtService.generate*` wrappers, `MailerInterface.sendWelcomeEmail` if truly unused).
7. **Remove back-door constants.** Separate holder-expiry from code-expiry env vars; move the
   hardcoded URLs into configuration.
8. **Fix the `codes` index** (`userId` → `holderId`).
9. **Merge/rename `holders`** policy duplication into the shared validators; keep the module boundary.

---

## Before / After Interface (shallow cases)

`JwtService` today leaks the `jsonwebtoken` union:

```ts
// before
verifyToken(token: string): JwtPayload | string;
generateTokens(userId: string, role: Roles): { accessToken: string; refreshToken: string };
```

Proposed domain surface:

```ts
// after
type TokenClaims = {
  userId: string;
  role: Roles;
  type: TokenTypes;
  jti: string;
  exp: number;
};
interface TokenIssuer {
  issueSession(userId: string, role: Roles): TokenPair; // { accessToken, refreshToken }
  verify(token: string, expected: TokenTypes): TokenClaims; // throws InvalidTokenError
}
```

The session-persistence sequence, currently spread across `AuthService` call sites, becomes:

```ts
// AuthService
const pair = await this.sessions.issue(user); // sign + persist refresh record + return tokens
```

`AuthService` no longer casts, no longer sequences revoke/create, and no longer imports
`JwtService`'s third-party types.

---

## Summary Verdict

- **Deep:** `libs/logger`, `libs/mailer`, `libs/templates-engine`.
- **Acceptable:** `auth` internals (`codes`, `tokens`), `users` CRUD, `AuthService`.
- **Shallow:** `JwtService`, `CryptoService`, `TenantsService`, `holders` (as a near-clone of user).
- **Dominant smell:** absence of module facades → concrete internals cross every boundary; one
  layering inversion (`common → auth`).
- **Quick wins:** fix the finder/`null` contract, fix the `codes` index, collapse session issuance,
  delete unwired `config-service`.
