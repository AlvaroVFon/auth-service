---
date: '2026-10-04'
requested_by: 'AlvaroVFon'
slug: 'bug-scan-fixes'
status: 'implemented'
---

# Implementation — Bug scan fixes

## Goal & Problem

Cerrar los hallazgos confirmados del bug scan que siguen presentes en `main`,
evitando replay de refresh tokens, doble consumo de códigos, bypass del
lockout, sesiones activas tras reset de contraseña, estados parciales de
signup y expiraciones/configuración silenciosamente incorrectas.

## Acceptance Criteria

- [x] Una sola solicitud concurrente puede rotar un refresh token; las demás
      son rechazadas.
- [x] Un código de signup o reset se consume como máximo una vez bajo
      validación concurrente.
- [x] Los intentos de login concurrentes se acumulan sin lost updates y el
      lockout se aplica al alcanzar el límite.
- [x] Reset de contraseña revoca todos los refresh tokens existentes.
- [x] Los errores de renderizado o SMTP se propagan y signup no deja un holder
      reutilizable huérfano.
- [x] Holders y códigos usan `CODE_EXPIRATION_MS` con una expiración futura por
      defecto.
- [x] La composición usa `JWT_EXPIRATION`, la clave documentada.

## Test Plan

| Case                  | Type        | Input / state                     | Expected result                | Test file                                                 |
| --------------------- | ----------- | --------------------------------- | ------------------------------ | --------------------------------------------------------- |
| Refresh concurrente   | concurrency | Dos rotaciones con el mismo JTI   | Solo una resuelve              | `test/integration/src/auth/services/auth.service.test.ts` |
| Código concurrente    | concurrency | Dos validaciones del mismo código | Solo una resuelve              | `test/integration/src/auth/codes/codes.service.test.ts`   |
| Lockout concurrente   | concurrency | Dos incrementos simultáneos       | El contador aumenta en dos     | `test/integration/src/users/users.service.test.ts`        |
| Reset revoca sesiones | security    | Refresh emitido antes del reset   | El refresh es rechazado        | `test/integration/src/auth/services/auth.service.test.ts` |
| Fallo de SMTP         | error       | `sendMail` rechaza                | El adapter rechaza             | `test/unit/src/libs/mailer/nodemailer.adapter.test.ts`    |
| Signup con SMTP caído | error       | Holder creado y mail fallido      | Holder y código se eliminan    | `test/integration/src/auth/services/auth.service.test.ts` |
| Expiración de holder  | edge        | `CODE_EXPIRATION_MS` configurado  | `expiresAt` queda en el futuro | `test/integration/src/holders/holders.service.test.ts`    |
| Clave JWT             | config      | Solo `JWT_EXPIRATION` configurada | Se usa ese TTL                 | `test/unit/src/config/application.composition.test.ts`    |
