---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'application-composition'
status: 'implemented'
---

# Implementation — Application Composition

## Goal & Problem

Use one explicit application composition in production and tests instead of
duplicating the complete dependency graph in `bootstrap.ts` and
`test/utils/app.ts`. Production defaults remain environment-driven while tests
override only their logger, mailer, rate limits, and server concerns.

## Acceptance Criteria

- [x] Production and test entrypoints use the same composition factory.
- [x] HTTP middleware and module initialization are shared.
- [x] Test-specific mailer, logger, JWT refresh configuration, and rate limits remain injectable.
- [x] Existing bootstrap, integration, and E2E behavior remains unchanged.

## Test Plan

| Case                  | Type       | Input / state                                | Expected result                           | Test file                                             |
| --------------------- | ---------- | -------------------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| Production defaults   | happy      | Factory without overrides                    | Production modules and database are wired | `test/unit/src/config/bootstrap.test.ts`              |
| Test overrides        | happy      | Silent logger, mock mailer, test rate limits | Test app uses those collaborators         | `test/e2e/auth/rate-limit.test.ts`                    |
| Shared initialization | regression | Bootstrap and test app                       | Same middleware/module order and routes   | `test/unit/src/config/bootstrap.test.ts`, `test/e2e/` |
