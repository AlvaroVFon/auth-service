---
date: '2026-10-03'
requested_by: 'alvarovillamarin'
slug: 'adapter-unit-tests'
status: 'implemented'
---

# Implementation — Unit tests for infrastructure adapters

## Goal & Problem

The coverage analysis showed the infrastructure adapters in `src/libs/*/adapters`
and the template engine are never loaded by the test suite (0% real coverage).
They are the outbound boundaries of the service: logging, mail delivery, and
template rendering. A regression in any of them is invisible to the current
green suite. The user-facing outcome is a suite that exercises each adapter's
happy, edge, and error paths with deterministic doubles (no network, no SMTP),
so regressions fail fast.

## Acceptance Criteria

- [x] `HandlebarsEngine.render` interpolates context values and reads the
      template from `TEMPLATES_PATH`.
- [x] `HandlebarsEngine.render` leaves missing context keys as empty strings
      (documented behavior of non-strict handlebars).
- [x] `HandlebarsEngine.render` rejects when the template file does not exist.
- [x] `WinstonLogger` delegates `info`/`error`/`warn`/`debug` to the winston
      logger, including the error argument branch for error/warn/debug.
- [x] `WinstonLogger.createLogger` produces a logger with `info` level and one
      console transport.
- [x] `ConsoleLogger` delegates each level to the matching console method,
      including the error argument branch.
- [x] `NodeMailerAdapter.createTransport` maps env to transport options and sets
      `secure` only when the port is 465; omits `auth` when no SMTP user.
- [x] `NodeMailerAdapter.sendEmail` sends `from`/`to`/`subject`/`html`, and logs
      on failure without throwing.
- [x] `NodeMailerAdapter.sendMailWithTemplate` renders then sends, and logs on
      render/send failure without throwing.
- [x] `sendWelcomeEmail` / `sendSignupVerificationEmail` /
      `sendResetPasswordEmail` use the expected subject, template, and inject
      `appName` + `year` into the context.

## Test Plan

| Case                             | Type  | Input / state                          | Expected result                          | Test file                                                        |
| -------------------------------- | ----- | -------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Render welcome template          | happy | valid context                          | output contains rendered values, no `{{` | `test/unit/src/libs/templates-engine/handlebars.adapter.test.ts` |
| Missing context key              | edge  | context without `userName`             | key renders as empty string              | `test/unit/src/libs/templates-engine/handlebars.adapter.test.ts` |
| Unknown template                 | error | `templatePath = 'does_not_exist'`      | rejects (ENOENT)                         | `test/unit/src/libs/templates-engine/handlebars.adapter.test.ts` |
| Delegate info/error/warn/debug   | happy | message (+ Error for error/warn/debug) | winston logger called with same args     | `test/unit/src/libs/logger/winston.logger.test.ts`               |
| createLogger config              | happy | new instance                           | level `info`, 1 console transport        | `test/unit/src/libs/logger/winston.logger.test.ts`               |
| ConsoleLogger levels             | happy | message (+ Error)                      | matching console method called           | `test/unit/src/libs/logger/console.logger.test.ts`               |
| Transport options from env       | happy | SMTP_PORT=1025, user set               | host/port/secure/auth mapped             | `test/unit/src/libs/mailer/nodemailer.adapter.test.ts`           |
| Transport secure on 465          | edge  | SMTP_PORT=465                          | `secure === true`                        | `test/unit/src/libs/mailer/nodemailer.adapter.test.ts`           |
| Transport without auth           | edge  | SMTP_USER=''                           | `auth` omitted                           | `test/unit/src/libs/mailer/nodemailer.adapter.test.ts`           |
| sendEmail success                | happy | mocked transporter resolves            | sendMail called with mapped fields       | `test/unit/src/libs/mailer/nodemailer.adapter.test.ts`           |
| sendEmail failure                | error | mocked transporter rejects             | logger.error called, no throw            | `test/unit/src/libs/mailer/nodemailer.adapter.test.ts`           |
| sendMailWithTemplate success     | happy | mock render + sendEmail                | render then send with rendered body      | `test/unit/src/libs/mailer/nodemailer.adapter.test.ts`           |
| sendMailWithTemplate render fail | error | mock render throws                     | logger.error called, no throw            | `test/unit/src/libs/mailer/nodemailer.adapter.test.ts`           |
| welcome/signup/reset emails      | happy | context                                | right subject + template + appName/year  | `test/unit/src/libs/mailer/nodemailer.adapter.test.ts`           |

## Notes

- These are characterization tests for existing code: the red phase is expected
  to pass immediately. If any fails, it is a bug to report, not a test to weaken.
- `ConsoleLogger` is currently unreferenced (dead code). Tests are added to close
  the coverage gap; the remove-vs-test decision is tracked separately.
