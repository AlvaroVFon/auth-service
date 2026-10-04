---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'session-facade'
status: 'implemented'
---

# Implementation — Session Facade

## Goal & Problem

Move refresh-session orchestration out of `AuthService` while preserving the
different policies for login and refresh rotation. The auth flow should expose
one session collaborator that signs tokens, validates stored refresh state,
revokes the correct records, and persists request context.

## Acceptance Criteria

- [x] Login session creation revokes all previous sessions before persisting the new refresh token.
- [x] Refresh rotation rejects invalid or revoked tokens and links the old token to the replacement.
- [x] Refresh session persistence retains IP address and User-Agent.
- [x] `AuthService` no longer sequences JWT generation, verification, or refresh-token persistence.
- [x] Existing unit, integration, and E2E authentication behavior remains unchanged.

## Test Plan

| Case             | Type       | Input / state                       | Expected result                                               | Test file                                                                   |
| ---------------- | ---------- | ----------------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Login session    | happy      | Valid user and context              | Previous sessions revoked and new pair persisted              | `test/unit/src/auth/tokens/session.service.test.ts`                         |
| Refresh rotation | happy      | Active refresh token                | Old token revoked with replacement JTI and new pair persisted | `test/unit/src/auth/tokens/session.service.test.ts`                         |
| Revoked refresh  | error      | Revoked stored token                | `UnauthorizedError`                                           | `test/unit/src/auth/tokens/session.service.test.ts`                         |
| Auth regression  | regression | Existing login/refresh/logout flows | All existing behavior passes                                  | `test/integration/src/auth/services/auth.service.test.ts`, `test/e2e/auth/` |
