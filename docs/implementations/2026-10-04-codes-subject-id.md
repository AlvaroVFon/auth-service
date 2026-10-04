---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'codes-subject-id'
status: 'implemented'
---

# Refactor — Codes subject id (part 3b)

## Goal & Problem

`Code.holderId` was populated with a holder id for signup codes and a user id for reset-password
codes, yet the schema declared `ref: 'Holder'`. The field name and ref no longer described what was
stored — a back-door assumption shared between `auth` and `codes`. `CreateCodeDTO` was unused.

## Acceptance Criteria

- [x] `Code.subjectId` is a neutral polymorphic reference; the false `ref: 'Holder'` is removed.
- [x] Lookup index renamed to `(subjectId, type, used)`.
- [x] `CodesService` uses `subjectId` and messages `subjectId is required` / `Invalid subjectId`.
- [x] The `/auth/verify` HTTP query param stays `holderId` (holder-signup boundary) and its missing
      value still returns `holderId is required`.
- [x] Unused `CreateCodeDTO` removed.
- [x] Signup (holder) and reset (user) code flows unchanged.

## Test Plan

| Case                        | Type             | Input / state               | Expected result              | Test file                                               |
| --------------------------- | ---------------- | --------------------------- | ---------------------------- | ------------------------------------------------------- |
| Codes indexed by subject    | characterization | schema indexes              | `(subjectId,type,used)`      | `test/integration/src/auth/codes/codes.service.test.ts` |
| Create/validate by subject  | characterization | subjectId + code            | code row keyed by subjectId  | `test/integration/src/auth/codes/codes.service.test.ts` |
| Verify signup code (holder) | characterization | `/auth/verify?holderId=...` | 204 / 400 with same messages | `test/e2e/auth/verify.test.ts`                          |
| Reset code (user subject)   | characterization | reset code with user id     | password reset works         | `test/e2e/auth/reset-password.test.ts`                  |
