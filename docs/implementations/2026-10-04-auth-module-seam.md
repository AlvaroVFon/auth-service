---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'auth-module-seam'
status: 'implemented'
---

# Refactor — AuthModule as a thin seam (part 4c)

## Goal & Problem

`AuthModule` took 11 collaborators and constructed `SessionService`, `AuthService`, `AuthController`
and `AuthTenantController` itself, making the module a composition magnet that mixed wiring, policy
and construction. The composition root is the legitimate high point to build the object graph and
decide policy.

## Acceptance Criteria

- [x] `AuthModule` takes a single dependencies object and no longer constructs services.
- [x] The auth graph (`SessionService`, `AuthService`, controllers) is assembled in
      `application.composition.ts`.
- [x] Route registration and HTTP behavior unchanged.

## Test Plan

| Case                  | Type             | Input / state            | Expected result     | Test file     |
| --------------------- | ---------------- | ------------------------ | ------------------- | ------------- |
| App boots with routes | characterization | `composition.initialize` | auth routes respond | `test/e2e/**` |
