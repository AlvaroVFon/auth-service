# Account Lockout (Bloqueo de Cuentas)

## Purpose

Protect user accounts against brute-force and credential-stuffing attacks by temporarily locking an account after a configurable number of consecutive failed login attempts. The lockout automatically expires after a configurable duration, allowing the user to try again.

When a user attempts to log in:

1. If the account is currently locked (`lockoutUntil` is in the future), the login is rejected immediately with an `AccountLockedError` (HTTP 423).
2. If the password is incorrect, the `loginAttempts` counter is incremented. If the counter reaches the configured maximum, `lockoutUntil` is set to `now + LOCKOUT_DURATION_MS`.
3. If the password is correct, `loginAttempts` is reset to `0` and `lockoutUntil` is cleared (`null`), and the normal token-generation flow continues.

The error message for a locked account must be generic enough to not reveal whether the account exists, but distinct enough from `InvalidCredentialsError` to inform legitimate users that their account is temporarily locked.

## Acceptance Criteria

- The `User` schema and interface include `loginAttempts: number` (default `0`) and `lockoutUntil: Date | null` (default `null`).
- `loginAttempts` and `lockoutUntil` are excluded from JSON serialization (like `password`).
- A new `AccountLockedError` exception class exists in `auth.exceptions.ts` with HTTP status `423`, code `ACCOUNT_LOCKED`.
- On failed password, `loginAttempts` is atomically incremented on the user document.
- When `loginAttempts` reaches `MAX_LOGIN_ATTEMPTS` (env-configurable, default `5`), `lockoutUntil` is set to `Date.now() + LOCKOUT_DURATION_MS`.
- `LOCKOUT_DURATION_MS` is env-configurable (default `900000` — 15 minutes).
- On successful login, `loginAttempts` is reset to `0` and `lockoutUntil` is set to `null`.
- If the account is locked (`lockoutUntil > now`), login throws `AccountLockedError` before checking the password.
- If the lockout has expired (`lockoutUntil <= now`), the login proceeds normally (the expired lockout does not block).
- The `AuthService` constructor receives `maxLoginAttempts` and `lockoutDurationMs` as configuration parameters.
- `bootstrap.ts` reads `MAX_LOGIN_ATTEMPTS` and `LOCKOUT_DURATION_MS` from env and passes them to `AuthModule`/`AuthService`.
- `.env.test` includes `MAX_LOGIN_ATTEMPTS=5` and `LOCKOUT_DURATION_MS=900000`.
- Existing login tests continue to pass (the default fixture user has `loginAttempts: 0`).

## Technical Notes

- **Atomicity**: Use Mongoose `findOneAndUpdate` with `$inc` and `$set` operators for atomic counter updates, avoiding race conditions on concurrent login attempts.
- **UsersService**: A new method `incrementLoginAttempts(userId: string)` and/or the existing `updateOneById` can be used. The key requirement is that the update must be atomic and must not trigger password hashing (since `loginAttempts`/`lockoutUntil` are not `password`).
- **Lockout check timing**: The lockout check must happen _after_ the user is found but _before_ the password comparison, to avoid unnecessary bcrypt work on locked accounts.
- **Security**: The `toJSON` transform must strip `loginAttempts` and `lockoutUntil` to prevent leaking lockout state in API responses.
- **Error message**: Use `"Account is temporarily locked. Please try again later."` for `AccountLockedError`.
- **No notification**: This spec does not include email notifications to the user about lockout events (out of scope).
- **Reset password interaction**: A successful password reset does NOT reset the lockout counter (out of scope for this feature, can be added later).

## Dependencies

- Existing `User` schema and `UsersService` (for adding fields and update methods).
- Existing `AuthService.login()` flow (to be modified).
- Existing exception hierarchy (`BaseError` → `auth.exceptions.ts`).
- Environment configuration pattern (`getStringEnvVariable`, `getNumberEnvVariable` from `env.config.ts`).
- `bootstrap.ts` for wiring new config values.

## Out of Scope

- Email notifications when an account is locked.
- Admin unlock / manual lockout override.
- IP-based lockout (only account-based).
- Resetting lockout counter on password reset.
- Progressive lockout durations (exponential backoff).
- Rate limiting per endpoint (separate feature in ROADMAP Fase 3).
