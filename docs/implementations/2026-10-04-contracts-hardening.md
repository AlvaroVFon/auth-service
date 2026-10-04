---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'contracts-hardening'
status: 'implemented'
---

# Refactor — Module contract hardening (part 2)

## Goal & Problem

The module scan (docs/module-design/2026-10-04-whole-repository.json) found the public contracts
leak representation and policy across boundaries:

- `UsersPort` exposes `incrementLoginAttempts(id, max, dur)` (lockout policy pushed to the caller)
  and `updateOneById(id, Partial<User>)` (auth writes `loginAttempts`/`lockoutUntil`/`password`
  internals).
- `UsersPort.createFromHolder(holder: Holder)` couples `users` to the `holders` entity.
- `AuthService` depends on the concrete `BlacklistService` although `TokenBlacklistPort` exists.
- `HoldersPort`/`TenantsPort`/`UsersPort` are declared inline in barrels and nobody declares
  `implements`, so the contracts are structural only.
- `auth/index.ts` is an unused facade exporting the concrete `AuthService`; no consumer imports it.

Outcome: intent-based ports enforced at compile time, account/lockout policy owned by `users`, and
a facade for `auth` with a real consumer. Observable HTTP behavior is unchanged.

## Acceptance Criteria

Invariants that MUST hold after the refactor:

- [x] Login outcomes/errors unchanged: `InvalidArgumentError` (missing/invalid input),
      `InvalidCredentialsError` (unknown user or bad password), `AccountLockedError` (active
      lockout, checked before password comparison), same messages/status codes.
- [x] Lockout semantics unchanged: failed attempt increments atomically, lock is set when attempts
      reach the threshold, successful login resets attempts and lock; policy values still come from
      the composition root with defaults 5 / 900000.
- [x] `resetPassword` still hashes the new password and revokes all refresh sessions.
- [x] `validateSignupVerificationCode` still creates a verified user from the holder's hashed
      password and deletes the holder; passwords are never re-hashed.
- [x] `UsersPort` exposes no `Partial<User>` and no raw lockout scalars; users owns its
      representation.
- [x] `HoldersPort`/`TenantsPort` signatures unchanged; `auth` public HTTP surface unchanged.
- [x] Same number/order of DB round-trips on the login path.

## Test Plan

| Case                                                | Type             | Input / state                      | Expected result                                | Test file                                                 |
| --------------------------------------------------- | ---------------- | ---------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| Concurrent failed logins                            | characterization | 2 wrong-password verifications     | `loginAttempts === 2` (atomic `$inc`)          | `test/integration/src/users/users.service.test.ts`        |
| Lockout at threshold                                | characterization | attempts = max-1, wrong password   | `lockoutUntil` set within window               | `test/integration/src/auth/services/auth.service.test.ts` |
| Locked account rejects before password compare      | characterization | active `lockoutUntil`, spy compare | `AccountLockedError`, compare not called       | `test/integration/src/auth/services/auth.service.test.ts` |
| Successful login resets attempts                    | characterization | attempts = 3, lockout expired      | `loginAttempts === 0`, `lockoutUntil === null` | `test/integration/src/auth/services/auth.service.test.ts` |
| Password reset hashes + revokes                     | characterization | valid code                         | new hash stored, old refresh token rejected    | `test/integration/src/auth/services/auth.service.test.ts` |
| Verify email creates verified user from holder hash | characterization | valid signup code                  | user created `verified: true`, holder deleted  | `test/integration/src/auth/services/auth.service.test.ts` |
| Reset-password rejects invalid / missing user id    | characterization | bad ObjectId / unknown id          | `InvalidArgumentError` / `EntityNotFoundError` | `test/integration/src/auth/services/auth.service.test.ts` |
