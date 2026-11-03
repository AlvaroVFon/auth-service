---
date: '2026-11-03'
requested_by: 'AlvaroVFon'
slug: 'lockout-window-reset'
status: 'implemented'
---

# Implementation — Reinicio de la ventana de intentos al expirar el lockout

## Goal & Problem

Un lockout vencido no reiniciaba `loginAttempts`. El primer password incorrecto
pasaba de `MAX_LOGIN_ATTEMPTS` a `MAX_LOGIN_ATTEMPTS + 1`, superaba el umbral y
fijaba un `lockoutUntil` nuevo. El usuario disponía de un solo intento por
ventana y un atacante podía mantener la cuenta bloqueada con una petición cada
`LOCKOUT_DURATION_MS`.

Issue: #78.

## Decisión

`UsersService.verifyCredentials` limpia `loginAttempts` y `lockoutUntil` cuando
`lockoutUntil` ya venció, antes de comparar la contraseña. Se reutiliza el patrón
que ya aplica `MfaService.assertNotLocked`: el lockout activo sigue rechazando
antes de comparar, y el vencido abre una ventana nueva. El fallo actual se cuenta
desde cero con el `$inc` atómico existente.

## Acceptance Criteria

- [x] Un fallo tras un lockout vencido deja `loginAttempts = 1` y
      `lockoutUntil = null`.
- [x] Un fallo que alcanza el máximo sigue aplicando el lockout.
- [x] Un login correcto tras el lockout vencido limpia el estado.

## Test Plan

| Case                        | Type        | Input / state                                       | Expected result                        | Test file                                                 |
| --------------------------- | ----------- | --------------------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| Lockout vencido + fallo     | integration | `loginAttempts=5`, `lockoutUntil` en el pasado      | `loginAttempts=1`, `lockoutUntil=null` | `test/integration/src/users/users.service.test.ts`        |
| Umbral de intentos          | integration | `loginAttempts=4`, sin lockout, password incorrecto | `loginAttempts=5` y lockout en ventana | `test/integration/src/users/users.service.test.ts`        |
| Login correcto tras lockout | integration | `loginAttempts=5`, `lockoutUntil` en el pasado      | tokens y estado limpio                 | `test/integration/src/auth/services/auth.service.test.ts` |

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test`: 226 unit, 306 integration, 178 e2e.

## Fuera de alcance

Cambiar `MAX_LOGIN_ATTEMPTS`/`LOCKOUT_DURATION_MS`, el flujo de MFA y el
desbloqueo administrativo vía `PATCH /users/:id`.
