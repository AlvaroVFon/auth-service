---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'module-design-foundation'
status: 'implemented'
---

# Implementation — Module Design Foundation

## Goal & Problem

Apply the first low-risk improvements from the module design review without changing
the authentication flow: fix the incorrect codes index, reject inactive tenants,
move public links out of `AuthService`, and make finder contracts truthful by
returning `null` when an entity is absent.

## Acceptance Criteria

- [x] Code lookups are indexed by `holderId`, `type`, and `used`.
- [x] Inactive tenants cannot obtain an access token.
- [x] Signup and password-reset links use the configurable `PUBLIC_APP_URL`.
- [x] `UsersService.findById` and `HoldersService.findById` return `null` when the
      entity does not exist, while still rejecting missing or malformed IDs.
- [x] Existing authentication, signup, reset-password, and tenant-login tests pass.

## Test Plan

| Case             | Type  | Input / state                                | Expected result                           | Test file                                                        |
| ---------------- | ----- | -------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Codes index      | happy | Inspect schema indexes                       | Index contains `holderId`, `type`, `used` | `test/integration/src/auth/codes/codes.service.test.ts`          |
| Inactive tenant  | error | Valid credentials for `active: false` tenant | `UnauthorizedError` and no token          | `test/integration/src/auth/services/auth-tenant.service.test.ts` |
| Missing user     | edge  | Valid ObjectId without a user                | `UsersService.findById` returns `null`    | `test/integration/src/users/users.service.test.ts`               |
| Missing holder   | edge  | Valid ObjectId without a holder              | `HoldersService.findById` returns `null`  | `test/integration/src/holders/holders.service.test.ts`           |
| Configured links | happy | `PUBLIC_APP_URL` supplied to `AuthService`   | Mail links use that base URL              | `test/integration/src/auth/services/auth.service.test.ts`        |
