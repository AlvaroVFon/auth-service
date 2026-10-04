---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'mailer-policy-split'
status: 'implemented'
---

# Refactor — Split generic mailer from auth notification policy (part 4b)

## Goal & Problem

`MailerInterface` mixed a general mechanism (`sendEmail`, `sendMailWithTemplate`) with business
policy (`sendWelcomeEmail`, `sendSignupVerificationEmail`, `sendResetPasswordEmail`), and the
nodemailer adapter imported the domain `MailTemplate` enum. `AuthService` also held the deployment
`publicAppUrl` and built mail links itself. General mechanism and specific policy must be separated.

Outcome: the mail port is generic; an `AuthMailer` in `auth` owns subjects, templates, links and
branding; `AuthService` no longer knows the public URL or the mail templates.

## Acceptance Criteria

- [x] `MailerInterface` exposes only `sendEmail` and `sendMailWithTemplate`.
- [x] `NodeMailerAdapter` no longer imports `MailTemplate` nor knows the three business emails.
- [x] Email subjects, templates, links and `appName`/`year` context are unchanged in content.
- [x] `AuthService` no longer takes `publicAppUrl`; it calls `AuthMailer`.
- [x] Unused `sendWelcomeEmail` removed.
- [x] No HTTP behavior change; same templates rendered to MailHog.

## Test Plan

| Case                         | Type             | Input / state            | Expected result                 | Test file                                                 |
| ---------------------------- | ---------------- | ------------------------ | ------------------------------- | --------------------------------------------------------- |
| Generic template send        | characterization | context `{a:1}`          | render called with same context | `test/unit/src/libs/mailer/nodemailer.adapter.test.ts`    |
| Signup mail composition      | characterization | holder id + code         | template + link + appName       | `test/unit/src/auth/services/auth-mailer.test.ts`         |
| Reset mail composition       | characterization | user id + code           | template + link + appName       | `test/unit/src/auth/services/auth-mailer.test.ts`         |
| AuthService calls AuthMailer | characterization | signup / forgot-password | `[email, id, code]`             | `test/integration/src/auth/services/auth.service.test.ts` |
