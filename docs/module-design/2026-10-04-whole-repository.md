# Module Design Brief — whole-repository

## Responsibility

Expose feature modules (users, auth, holders, tenants) and infrastructure libs so a consumer can wire and use one module through a narrow public contract without reaching into a neighbour's internal files or representation.

## Public Interface

```typescript
// users/index.ts
export type { User } from './users.interface';
export { UsersModule } from './users.module';
export interface UsersPort {
  createFromHolder(holder: Holder): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  incrementLoginAttempts(
    id: string,
    maxAttempts: number,
    lockoutDurationMs: number,
  ): Promise<User | null>;
  updateOneById(id: string, updateData: Partial<User>): Promise<User | null>;
}

// holders/index.ts
export interface HoldersPort {
  create(email: string, password: string): Promise<Holder>;
  findByEmail(email: string): Promise<Holder | null>;
  findById(id: string): Promise<Holder | null>;
  deleteById(id: string): Promise<void>;
}

// tenants/index.ts
export interface TenantsPort {
  findById(id: string): Promise<Tenant | null>;
}

// auth/index.ts  (barrel; currently imported by nobody)
export { AuthModule } from './auth.module';
export { AuthService } from './services/auth.service';
export type { Credentials, SignupCredentials } from './auth.interface';

// common/ports/token-blacklist.port.ts (port consumed by middleware)
export interface TokenBlacklistPort {
  blacklist(jti: string, expiresAt: Date): Promise<void>;
  isBlacklisted(jti: string): Promise<boolean>;
}

// libs ports
export interface LoggerInterface {
  info;
  error;
  warn;
  debug;
}
export type { MailerInterface } from './mailer/mailer.interface';
export type { TemplateRenderer } from './templates-engine/template-renderer.interface';
```

## Hidden Knowledge

- Mongo persistence and Mongoose model wiring per module (models are built inside each Module class, not passed in).
- Password hashing via bcrypt and salt-round resolution lives in CryptoService.
- JWT signing/verification, token type semantics and refresh metadata derivation live in JwtService.
- Refresh-token rotation ordering and one-time code consumption are encapsulated by SessionService and CodesService.
- Account lockout math (attempt threshold and lockout window) is decided by the composition root and applied inside UsersService.
- HTTP wiring (routes, rate limiters, middleware order) is encapsulated by each module's Router.

## Complexity Absorbed

- Session issuance/rotation sequence (sign, revoke old, persist new) collapsed into SessionService.create/rotate.
- JWT verification union normalized to a TokenClaims result instead of jsonwebtoken's JwtPayload | string.
- Finder miss semantics normalized to T | null across users/holders/tenants.
- Layering inversion removed: common depends on TokenBlacklistPort instead of auth's concrete BlacklistService.
- One-time code validation performed atomically with an update-if-unused filter so callers need no retry.

## Failure Contract

| Failure                                | How the caller sees it                           | Caller action                                                        |
| -------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- |
| Credential mismatch or unknown account | InvalidCredentialsError (domain 401)             | Return 401; do not branch on which field failed.                     |
| Account temporarily locked             | AccountLockedError                               | Return 423/401 with retry guidance; do not inspect lockoutUntil.     |
| Entity not found on finder             | null (finders) / EntityNotFoundError (mutations) | Check null for finders; catch EntityNotFoundError for mutations.     |
| Invalid or expired token               | InvalidTokenError from JwtService                | Translate to 401 at the boundary; never read jsonwebtoken internals. |
| Invalid argument (missing/bad format)  | InvalidArgumentError                             | Return 400 with the domain message.                                  |

## Split or Merge Decision

- Decision: keep
- Rationale (net complexity): Module boundaries are correct in kind (auth, users, holders, tenants, libs), but the surfaces must be tightened rather than redrawn: give every module an enforced port, stop leaking entity representation, and split the mailer's general mechanism from its business policy. Merging holders into users or deleting tenants is not justified yet by net complexity.

## Depth Verdict

| Granularity             | Verdict    | Evidence                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Macro (module boundary) | shallow    | Constructing auth still requires the caller to pass 15 dependencies through AuthModule (usersService, crypto, jwt, logger, mailer, codes, auth middleware, refresh-token, blacklist, holders, tenant service, lockout policy, rate-limit config, public URL); the facade exposes service/controller but no two-party contract, and auth/index.ts is never imported. |
| Micro (artifacts)       | acceptable | SessionService and CodesService hide real ordering/atomicity; JwtService and TenantsService remain thin (unused generate* wrappers, pass-through finder), and UsersService mixes lockout mechanism with externally-supplied policy.                                                                                                                                 |

### Caller Snippet

```typescript
// application.composition.ts — the caller must know every collaborator and policy.
const authModule = new AuthModule(
  usersModule.service,
  cryptoService,
  jwtService,
  logger,
  mailer,
  codeService,
  authenticationMiddleware,
  refreshTokenService,
  blacklistService,
  holdersService,
  authTenantService,
  options.maxLoginAttempts ?? getNumberEnvVariable('MAX_LOGIN_ATTEMPTS', 5),
  options.lockoutDurationMs ??
    getNumberEnvVariable('LOCKOUT_DURATION_MS', 900000),
  options.rateLimitConfig ?? getDefaultRateLimitConfig(),
  options.publicAppUrl ??
    getStringEnvVariable('PUBLIC_APP_URL', 'https://ourservice.com'),
);
```

## Leakage Flags

- [Critical] leakage-back-door: codes index built on nonexistent userId path (legacy finding) — The lookup index was previously declared on `userId` while the document field is `holderId`, leaving the (holderId,type,used) query unindexed. Now corrected to `holderId`. `src/auth/codes/codes.schema.ts:20`
- [Major] leakage-interface: common imported auth blacklist concrete class (layering inversion) — Authentication middleware previously imported auth/tokens/blacklist.service. It now depends on the TokenBlacklistPort owned by common; BlacklistService implements it. `src/common/ports/token-blacklist.port.ts:1`
- [Major] leakage-interface: JwtService.verifyToken leaked jsonwebtoken union — verifyToken used to return JwtPayload | string, forcing casts at every caller. It now returns the domain TokenClaims type. `src/libs/jwt/jwt.service.ts:56`
- [Major] leakage-interface: findById advertised |null but threw EntityNotFoundError — UsersService/HoldersService findById declared Promise<X | null> yet threw on miss, so callers kept dead null checks. They now return null and callers genuinely branch on it. `src/users/users.service.ts:67`
- [Major] leakage-back-door: updateOneById(Partial<User>) lets auth write internal user fields — AuthService resets loginAttempts/lockoutUntil through UsersPort.updateOneById(id, Partial<User>), so auth must know the user representation and can mutate any field (including password) without going through users' invariants (e.g. hashing is implicit). This is Tell-Don't-Ask broken across the boundary. `src/auth/services/auth.service.ts:99`
- [Major] leakage-interface: users port depends on holders' entity type — UsersPort.createFromHolder(holder: Holder) makes the users module import the holders entity type, coupling two modules through a concrete representation instead of an explicit primitive (for example a VerifiedEmail value with email and password). `src/users/index.ts:7`
- [Major] leakage-back-door: Reset-password code stores a User id in holderId with ref 'Holder' — CodesService.create always writes to field holderId with ref 'Holder', but forgot-password passes a User id. The field name and mongoose ref no longer describe what is stored for RESET_PASSWORD codes, an implicit assumption shared between auth and codes. `src/auth/codes/codes.schema.ts:8`
- [Major] leakage-back-door: Holder expiry and code expiry share CODE_EXPIRATION_MS — HoldersSchema derives its TTL from CODE_EXPIRATION_MS, the same env var that CodesService uses for one-time codes. Two unrelated concepts share one undeclared constant; changing code lifetime silently changes holder lifetime. `src/holders/holders.schema.ts:6`
- [Major] leakage-interface: Mailer port mixes a general mechanism with business policy — MailerInterface couples generic delivery (sendEmail/sendMailWithTemplate) with specific policy (sendWelcomeEmail/sendSignupVerificationEmail/sendResetPasswordEmail). The nodemailer adapter also imports MailTemplate from the mail/ domain folder, so infrastructure depends on a business enum. General mechanism and specific policy should be split. `src/libs/mailer/mailer.interface.ts:11`
- [Major] leakage-back-door: Validation logic and messages duplicated across five services — Although EMAIL_REGEX/PASSWORD_REGEX/OBJECTID_REGEX now live in common/constants/regex, the surrounding guard-and-error logic is copied in AuthService (login/signup/reset), UsersService, HoldersService, CodesService and RefreshTokenService. Changing a rule or message still forces edits in five-plus files; no email/password value object owns the policy. `src/auth/services/auth.service.ts:105`
- [Minor] leakage-interface: AuthTenantService duplicates ObjectId validation and compares secrets directly — AuthTenantService validates tenantId with Types.ObjectId.isValid and then calls TenantsPort.findById, which validates the same id again. It also reads tenant.active/tenant.secret directly, so tenant representation leaks into auth. The check belongs in tenants (verifyCredentials) or a dedicated operation. `src/auth/services/auth-tenant.service.ts:23`
- [Minor] leakage-interface: AuthService depends on concrete BlacklistService instead of the port — The port TokenBlacklistPort exists and BlacklistService implements it, yet AuthService and AuthModule type the dependency as the concrete class, so the boundary is weaker than it needs to be. `src/auth/services/auth.service.ts:32`
- [Major] leakage-back-door: common RequiredBodyMiddleware hardcodes the /auth/logout route — A generic common middleware embeds knowledge of an auth route via EXCLUDED_PATHS = ['/auth/logout']. This is the same class of shared-boundary assumption the TokenBlacklistPort refactor removed: common should be route-agnostic and receive the exclusion policy from the caller. `src/common/middlewares/required-body.middleware.ts:3`
- [Minor] leakage-interface: common owns codes/auth domain exception taxonomy — AlreadyGeneratedCodeError/InvalidCodeError live in common/exceptions/codes.exceptions.ts and UnauthorizedError/InvalidCredentialsError/AccountLockedError in auth.exceptions.ts. A shared BaseError kernel is legitimate, but codes/auth domain failures belong to their modules; common should only hold genuinely cross-cutting infra errors (as InfraError does). `src/common/exceptions/codes.exceptions.ts:3`
- [Minor] leakage-interface: WinstonLogger.logger exposes the concrete winston.Logger — The adapter declares a public `logger: winston.Logger` field, exposing the concrete logging library to anyone holding the logger. The LoggerInterface port is the intended surface; the field should be private. `src/libs/logger/adapters/winston.logger.ts:6`
- [Minor] leakage-back-door: NodeMailerAdapter mutates the caller's template context — sendWelcomeEmail/sendSignupVerificationEmail/sendResetPasswordEmail write appName and year onto the caller-supplied context object, so the caller's data is silently mutated. The adapter should copy the context before enriching it. `src/libs/mailer/adapters/nodemailer.adapter.ts:87`

## Improvements

- [Major] Session issuance was split by execution order across AuthService — The generate -> verify -> revoke -> persist sequence was duplicated across login and refresh within AuthService. Extracted into SessionService.create/rotate with JwtService.issueSession returning TokenPair metadata.
- [Major] AuthModule is a composition magnet with 15 constructor parameters — AuthModule receives usersService, cryptoService, jwtService, logger, mailService, codeService, authenticationMiddleware, refreshTokenService, blacklistService, holdersService, authTenantService plus maxLoginAttempts, lockoutDurationMs, rateLimitConfig and publicAppUrl, then constructs SessionService/AuthService/AuthController itself. Wiring, policy and construction are mixed; the caller must know every collaborator to build auth.
- [Minor] AuthModule exposes service/controller/tenantsController that nobody reads — The public fields are declared but the composition root only calls initialize(app). They are pass-through exports with no consumer; the real entry point is initialize.
- [Major] auth/index.ts facade is unused and exports concrete internals — The barrel exports AuthModule and the concrete AuthService, yet no file imports from '../auth'. Cross-module consumers bypass the facade entirely (auth.module imports users/holders indexes directly), so the boundary is undefined and the concrete class is the de-facto contract.
- [Major] Ports declared in barrels are not implemented by the concrete services — UsersPort/HoldersPort/TenantsPort live inside index.ts and the services (UsersService, HoldersService, TenantsService) never `implements` them. Compatibility is structural only, so a service change can silently break the contract at the composition root instead of failing to compile.
- [Major] Lockout policy parameters pushed onto UsersPort — incrementLoginAttempts(id, maxAttempts, lockoutDurationMs) requires the caller (AuthService) to pass the lockout policy on every failed login. The policy is decided once at the composition root, then threaded through two layers; the common case should be a domain default owned by users.
- [Major] JwtService exposes unused generate* wrappers and duplicate jti logic — The public surface has generateToken, generateAccessToken, generateRefreshToken, generateTenantToken, generateTokens, issueSession and signUserToken. Production uses only issueSession and generateTenantToken; generateAccessToken/generateRefreshToken/generateTokens are test-only and their jti logic duplicates issueSession/signUserToken. The interface is nearly as broad as the implementation.
- [Major] libs/config-service is an unwired dead abstraction — config-service.interface.ts, its Mongo adapter and schema have zero production wiring and no consumers outside their own folder. It is pure maintenance cost until a real dynamic-config need exists.
- [Minor] AuthService constructor mixes orchestration, lockout policy and deployment URL — AuthService takes ten collaborators including maxLoginAttempts/lockoutDurationMs (policy owned elsewhere) and publicAppUrl with a hardcoded default. The URL builds mail links inside the domain service, leaking a deployment concern into orchestration.
- [Minor] TenantsService.findById is a pass-through wrapper — The entire module is one method whose body is a single findById().lean().exec(). Signature is equivalent to the body; it earns its boundary only when a second tenant operation appears.
- [Minor] CodesService signup/forgot-password creators are 1:1 wrappers — createSignupCode and createForgotPasswordCode add no behavior over create(holderId, type); they only rename. They are intent-revealing but add a hop without hiding complexity.
- [Minor] RefreshTokenService.findAllActiveByUserId has no production consumer — The method is used only by integration tests; no production path lists active tokens. Either wire it or drop it to keep the surface honest.
- [Minor] tenants interface file is misspelled tentants.interface.ts — The filename `tentants.interface.ts` is imported by tenants/index.ts and tenants.service.ts. Renaming removes a permanent naming wart at low risk.
- [Major] CodesService reads CODE_EXPIRATION_MS and CODE_LENGTH from env instead of being injected — Unlike JwtService (which receives expiry via constructor), CodesService reads two env vars directly in its constructor. Config-injection policy is inconsistent across libs/modules and the code lifetime is a hidden global rather than a declared constructor contract.

## Delta vs previous

Baseline: docs/module-design.md

- 0 Persists · 5 Resolved · 25 New · 0 Not re-checked
- Resolved: `src/auth/codes/codes.schema.ts:20` — codes index built on nonexistent userId path (legacy finding)
- Resolved: `src/common/ports/token-blacklist.port.ts:1` — common imported auth blacklist concrete class (layering inversion)
- Resolved: `src/libs/jwt/jwt.service.ts:56` — JwtService.verifyToken leaked jsonwebtoken union
- Resolved: `src/users/users.service.ts:67` — findById advertised |null but threw EntityNotFoundError
- Resolved: `src/auth/tokens/session.service.ts:14` — Session issuance was split by execution order across AuthService

## Before / After Interface

After: each module exports one factory taking only ports/policy (`createAuthModule({ users, holders, tenants, jwt, mail, codes, blacklist, policy })`) and services declare `implements UsersPort|HoldersPort|TenantsPort` (compile-time check). Drop the `Partial<User>` and lockout scalars from the users port in favour of intent operations (`verifyCredentials`, `registerFailedAttempt`, `resetLockout`). Make the mailer port generic (`send(template, to, context)`) and move the `MailTemplate` policy into the auth/notification side. Delete unused `JwtService.generate*` wrappers and the unwired `libs/config-service`.
