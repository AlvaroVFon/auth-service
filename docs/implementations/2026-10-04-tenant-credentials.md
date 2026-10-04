---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'tenant-credentials'
status: 'implemented'
---

# Refactor — Tenants owns tenant credential verification (part 4d)

## Goal & Problem

`AuthTenantService` validated `tenantId` with `Types.ObjectId.isValid` and then called
`TenantsService.findById`, which validated the same id again; it also read `tenant.active` and
`tenant.secret` directly, leaking tenant representation into `auth`.

## Acceptance Criteria

- [x] Tenant id/secret validation and the active/secret check live in `tenants`.
- [x] Same error messages and status codes: `Tenant ID is required`, `Tenant ID is invalid`,
      `Tenant secret is required`, `Invalid credentials` (401).
- [x] `TenantsPort` gains `verifyCredentials`; `findById` unchanged.
- [x] No double ObjectId validation.

## Test Plan

| Case                     | Type             | Input / state           | Expected result        | Test file                                                        |
| ------------------------ | ---------------- | ----------------------- | ---------------------- | ---------------------------------------------------------------- |
| Missing/invalid tenantId | characterization | `''` / `invalid-id`     | `InvalidArgumentError` | `test/integration/src/auth/services/auth-tenant.service.test.ts` |
| Missing secret           | characterization | `tenantSecret: ''`      | `InvalidArgumentError` | `test/integration/src/auth/services/auth-tenant.service.test.ts` |
| Unknown/wrong/inactive   | characterization | wrong secret / inactive | `UnauthorizedError`    | `test/integration/src/auth/services/auth-tenant.service.test.ts` |
| Valid credentials        | characterization | valid id + secret       | tenant JWT             | `test/integration/src/auth/services/auth-tenant.service.test.ts` |
