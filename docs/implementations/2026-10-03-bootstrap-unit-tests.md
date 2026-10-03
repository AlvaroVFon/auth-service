---
date: '2026-10-03'
requested_by: 'alvarovillamarin'
slug: 'bootstrap-unit-tests'
status: 'implemented'
---

# Implementation — Testable bootstrap + wiring smoke test

## Goal & Problem

`src/config/bootstrap.ts` is the composition root: it builds the whole object
graph and wires the Express app, but no test ever loaded it (0% real coverage).
`test/utils/app.ts` duplicates the wiring by hand, so a change to a constructor
signature or a missing `initialize()` would not be caught. Worse, `bootstrap.ts`
started with a bare `process.loadEnvFile()` that throws `ENOENT` in any
environment without a `.env` file (tests, container without an env file), and it
had no way to inject fakes.

Outcome: bootstrap becomes loadable and testable, the real wiring is exercised,
and the env-file load no longer crashes when the file is absent.

## Acceptance Criteria

- [x] `bootstrap` accepts optional overrides; production behavior is unchanged
      when called with none.
- [x] Importing `bootstrap` does not throw when `.env` is missing.
- [x] The real wiring runs against a fake DB/app/startServer: DB connect,
      interceptors, global middlewares, and both modules are initialized exactly
      once.
- [x] Routes are mounted (a request reaches module middleware, not 404).
- [x] On DB failure the logger records `Application bootstrap failed` and
      `process.exit(1)` is invoked before the server starts.
- [x] `startServer` returns the HTTP server (so callers can close it).

## Test Plan

| Case                         | Type  | Input / state                 | Expected result                     | Test file                                |
| ---------------------------- | ----- | ----------------------------- | ----------------------------------- | ---------------------------------------- |
| Full wiring with doubles     | happy | fake db/app/startServer       | connect + startServer called once   | `test/unit/src/config/bootstrap.test.ts` |
| Route mounted                | happy | POST `/auth/login`            | not 404                             | `test/unit/src/config/bootstrap.test.ts` |
| Wired request path           | happy | GET `/users` no/invalid token | 401 from auth middleware            | `test/unit/src/config/bootstrap.test.ts` |
| Unknown route                | edge  | GET `/nope`                   | 404                                 | `test/unit/src/config/bootstrap.test.ts` |
| DB connect failure           | error | connect throws                | logs + `process.exit(1)`, no listen | `test/unit/src/config/bootstrap.test.ts` |
| Wiring failure short-circuit | error | connect throws                | startServer not called              | `test/unit/src/config/bootstrap.test.ts` |
| Default real server          | happy | no startServer override       | returned server is listening        | `test/unit/src/config/bootstrap.test.ts` |

## Production changes

- `bootstrap()` takes `BootstrapOverrides = {}` (new file
  `src/config/bootstrap.interface.ts`) and returns the server from `startServer`.
- Env loading is now `if (fs.existsSync('.env')) process.loadEnvFile('.env')`.
- `index.ts` calls `void bootstrap()` (the local Winston logger was redundant
  since the module owns one).
- `startServer` now returns `app.listen(...)`.

## Notes

- `process.exit` is asserted by mocking it to throw, which is what actually stops
  execution; asserting the call count alone is racy.
- `process.loadEnvFile`/`process.chdir` are not mocked (`mock.module` needs
  `--experimental-test-module-mocks`, not enabled in CI).
- Branch coverage stays at 60% because the `??` production fallbacks are the
  running path; the override path is what the tests exercise. Acceptable.
