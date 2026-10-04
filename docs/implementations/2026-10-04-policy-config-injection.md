---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'policy-config-injection'
status: 'implemented'
---

# Refactor — Policy config injection (part 3)

## Goal & Problem

Two back-door/config findings from the module scan:

- `CodesService` reads `CODE_EXPIRATION_MS`/`CODE_LENGTH` from `process.env` in its constructor
  while `JwtService` receives expiry by constructor — inconsistent config-injection policy.
- `HoldersSchema` derives its TTL from `CODE_EXPIRATION_MS`, the same var `CodesService` uses for
  one-time codes: two unrelated concepts sharing one undeclared constant.

Outcome: code-generation policy is injected at the composition root (same as JWT policy), and holder
lifetime has its own variable.

## Acceptance Criteria

Invariants that MUST hold after the refactor:

- [x] `new CodesService(model)` keeps working; generated codes are 6 chars and expire after the
      default window when no override is given.
- [x] Code expiry/length override still honored, now through constructor args instead of env.
- [x] Composition passes `CODE_EXPIRATION_MS`/`CODE_LENGTH` env values to `CodesService`.
- [x] Holder `expiresAt` uses `HOLDER_EXPIRATION_MS`; with `.env.test` set to 300000 the test-visible
      holder lifetime is unchanged.
- [x] No change to HTTP behavior, error messages, or the Codes/Holders document shape.

## Test Plan

| Case                             | Type             | Input / state                   | Expected result        | Test file                                               |
| -------------------------------- | ---------------- | ------------------------------- | ---------------------- | ------------------------------------------------------- |
| Default code length/expiry       | characterization | `new CodesService(model)`       | 6 chars, Date expiry   | `test/integration/src/auth/codes/codes.service.test.ts` |
| Injected expiry override         | characterization | `new CodesService(model, 2h)`   | `expiresAt ~ now + 2h` | `test/integration/src/auth/codes/codes.service.test.ts` |
| Injected code length             | characterization | `new CodesService(model, _, 8)` | code length 8          | `test/integration/src/auth/codes/codes.service.test.ts` |
| Holder expiry uses dedicated var | characterization | `HOLDER_EXPIRATION_MS=300000`   | `expiresAt > now`      | `test/integration/src/holders/holders.service.test.ts`  |
