---
date: '2026-11-02'
requested_by: 'AlvaroVFon'
slug: 'pr55-review-fixes'
status: 'implemented'
---

# Implementation — Fix blocking and should findings from PR #55 review

## Goal & Problem

PR #55 adds `/health`, `/ready`, `TRUST_PROXY` and graceful shutdown, but the
review found that the probes inherit the global rate limit (100 req / 15 min)
and are logged at `info` on every request, shutdown failures are silently
dropped, a second signal cannot force an exit, `TRUST_PROXY` accepts ambiguous
values, and `/ready` reads the global `mongoose` singleton instead of the
injected `Database`. The outcome is a deployment that restarts healthy
containers, floods the log on a home server, and can hang or half-shut down
without a breadcrumb.

## Acceptance Criteria

- [x] `/health` and `/ready` are exempt from the global rate limiter: more than
      `limit` requests inside the window still return `2xx`.
- [x] Probe requests are not written to the log at `info` by the HTTP logger.
- [x] A shutdown failure is logged with `logger.error` and turns into
      process exit code 1, never an unhandled rejection.
- [x] A second `SIGTERM`/`SIGINT` forces `exit(1)` instead of being ignored.
- [x] `server.close()` is bounded by a timeout so shutdown cannot hang forever.
- [x] `TRUST_PROXY` accepts only `true`, `false` or a decimal hop count; any
      other value throws with a message naming the variable.
- [x] `/ready` reports the state of the injected `Database` connection, not the
      `mongoose` module singleton.
- [x] `pnpm test:unit` (73), `pnpm test:integration` (150), `pnpm test:e2e` (75),
      `pnpm lint` and `pnpm build` stay green.

## Test Plan

| Case                                           | Type  | Input / state                                              | Expected result                                    | Test file                                             |
| ---------------------------------------------- | ----- | ---------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------- |
| Probes survive a burst beyond the global limit | happy | `limit + 30` sequential `GET /health`                      | every response is 200                              | `test/e2e/health.test.ts`                             |
| Probe path is not rate limited                 | edge  | `/health`, `/ready`                                        | limiter `skip` returns true                        | `test/unit/src/health/health.paths.test.ts`           |
| Probe request is not logged                    | edge  | `GET /health` with a skipping interceptor                  | `logger.info` never called, `next` called          | `test/unit/src/common/httplogger.interceptor.test.ts` |
| Regular request is still logged                | happy | `GET /users` with a skipping interceptor                   | `logger.info` called once                          | `test/unit/src/common/httplogger.interceptor.test.ts` |
| Server close rejects                           | error | `close` rejects                                            | `logger.error` called, exit(1), database untouched | `test/unit/src/config/shutdown.config.test.ts`        |
| Database close rejects                         | error | `database.close` rejects                                   | `logger.error` called, exit(1)                     | `test/unit/src/config/shutdown.config.test.ts`        |
| Server close hangs                             | error | `close` never calls back                                   | timeout rejects, `logger.error`, exit(1)           | `test/unit/src/config/shutdown.config.test.ts`        |
| Second signal forces exit                      | edge  | `shutdown()` twice                                         | `logger.warn` + exit(1), no second close           | `test/unit/src/config/shutdown.config.test.ts`        |
| `TRUST_PROXY` decimal hops                     | happy | `'1'`, `'0'`                                               | `1`, `0`                                           | `test/unit/src/config/trust-proxy.config.test.ts`     |
| `TRUST_PROXY` booleans                         | happy | `'true'`, `' FALSE '`                                      | `true`, `false`                                    | `test/unit/src/config/trust-proxy.config.test.ts`     |
| `TRUST_PROXY` unset/blank                      | edge  | `undefined`, `''`, `'   '`                                 | `false`                                            | `test/unit/src/config/trust-proxy.config.test.ts`     |
| `TRUST_PROXY` ambiguous value                  | error | `'0x2'`, `'1e3'`, `'1.5'`, `'-1'`, `'yes'`, `'10.0.0.0/8'` | throws naming `TRUST_PROXY`                        | `test/unit/src/config/trust-proxy.config.test.ts`     |
| Readiness from the injected database           | happy | injected getter returning `1`                              | 200 `ready`                                        | `test/unit/src/config/composition-health.test.ts`     |

## Notes

- The rate limiter and the HTTP logger now receive a `skip`/`shouldSkip`
  predicate built from `isHealthProbe`, so probe exclusion is explicit instead
  of depending on route mount order. `GlobalMiddlewares` builds the global
  limiter per `initialize` call, which also stops rate-limit state from leaking
  between app instances in the same process.
- `resolveTrustProxy` throws on invalid input; bootstrap catches it, logs
  `Application bootstrap failed` and exits with code 1.
- `Database.getReadyState()` was added so readiness does not go through
  `getConnection()`, which logs a warning on every probe when the database is
  down.
- `test/utils/app.ts` now injects the `Database` connected by `test/setup.db.ts`
  into the composition; otherwise `/ready` would report the state of a
  connection the test app never opened.
- Mutation check performed: reverting the limiter `skip` to `() => false` makes
  the burst e2e test fail with `429`, confirming the regression is locked.
