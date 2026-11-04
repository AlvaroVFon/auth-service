---
date: '2026-11-04'
requested_by: 'AlvaroVFon'
slug: 'users-patch-allowlist'
status: 'implemented'
---

# Implementation — Allowlist de campos editables en `PATCH /users/:id`

## Goal & Problem

El controlador reenviaba al servicio cualquier campo del body salvo `role`, `_id`,
`id` y `__v`. Un owner podía escribir `mfaEnabled: false`, `mfaSecret`,
`loginAttempts`, `lockoutUntil`, `verified` o `password` sin validación ni evento
de auditoría; desactivar MFA por esa vía dejaba el secreto en base de datos. El
endpoint pasa a aceptar solo campos de perfil.

Issue: #104.

## Decisión

`src/users/user-update-payload.ts` define la allowlist (`username`, `email`,
`password`, `telegramChatId`) y `parseUserUpdatePayload`, que rechaza con
`InvalidArgumentError` (400, `INVALID_ARGUMENT`) cualquier otra clave listándolas
en el mensaje: `Fields are not editable: <campos>`. Un body mixto no aplica la
parte permitida: la validación ocurre antes de tocar el documento. Los valores de
los campos permitidos deben ser string (`telegramChatId` admite `null` para
desregistrar el chat).

El parser también valida el formato antes de que el servicio escriba: `email` se
normaliza con `normalizeEmail` (trim + minúsculas) y se comprueba con `EMAIL_REGEX`
(400 `Invalid email format`), y `password` rechaza vacío o solo espacios y aplica
`PASSWORD_REGEX` (400 `INVALID_ARGUMENT`), la misma política que signup y reset. El
hash sigue en `UsersService.updateOneById`, que ahora hashea siempre que la clave
esté presente y mapea el `E11000` del índice único de email a
`EntityAlreadyExistsError` (`400 ENTITY_ALREADY_EXISTS`) en lugar de un 500.

`UsersService.updateOneById` recibe `UserUpdatePayload`, de forma que el compilador
también impide escribir estado de seguridad desde este flujo. Los cambios de
seguridad quedan pendientes de los endpoints de operaciones de soporte.

## Acceptance Criteria

- [x] AC-1: `PATCH /users/:id` con `username`, `email`, `password` o
      `telegramChatId` responde 200 y solo cambia esos campos.
- [x] AC-2: `mfaEnabled`, `mfaSecret`, `mfaPendingSecret`, `mfaRecoveryCodes`,
      `loginAttempts`, `lockoutUntil`, `verified` y `role` responden 400 con la
      lista de campos rechazados y el documento queda intacto.
- [x] AC-3: `password` se rehashea, el login con la nueva contraseña funciona y la
      respuesta no incluye hash ni texto plano.
- [x] AC-4: `README.md` publica la allowlist y el cambio de contrato; se ajustan
      `docs/getting-started/login-and-refresh.md` y la colección Postman.
- [x] AC-5: unit tests del validador y e2e por grupo de campos.

## Test Plan

| Case                | Type     | Input / state                                   | Expected result                                                         | Test file                                                                                    |
| ------------------- | -------- | ----------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Allowlist y tipos   | unit     | bodies válidos, vacíos y con campos prohibidos  | payload filtrado o `InvalidArgumentError`                               | `test/unit/src/users/user-update-payload.test.ts`                                            |
| Perfil editable     | e2e      | `username`, `email`                             | 200 y solo cambia el campo enviado                                      | `test/e2e/users/update-one-by-id.test.ts`                                                    |
| Email inválido      | unit/e2e | `"not-an-email"`, email en uso                  | 400 `Invalid email format` / `ENTITY_ALREADY_EXISTS`, documento intacto | `test/unit/src/users/user-update-payload.test.ts`, `test/e2e/users/update-one-by-id.test.ts` |
| Password inválida   | unit/e2e | `""`, `"   "`, `"weakpassword"`                 | 400 `INVALID_ARGUMENT`, hash intacto                                    | `test/unit/src/users/user-update-payload.test.ts`, `test/e2e/users/update-one-by-id.test.ts` |
| Password            | e2e      | usuario con hash conocido, `password` nuevo     | 200 sin hash, login nuevo 200, login viejo 401                          | `test/e2e/users/update-one-by-id.test.ts`                                                    |
| Campos de seguridad | e2e      | `mfaEnabled`, `mfaSecret`, `loginAttempts`, ... | 400 con los campos y documento intacto                                  | `test/e2e/users/update-one-by-id.test.ts`                                                    |
| Payload mixto       | e2e      | `username` + `verified`                         | 400 sin aplicar `username`                                              | `test/e2e/users/update-one-by-id.test.ts`                                                    |
| Telegram chat id    | e2e      | `" 4242 "`, `"abc"`, `null`                     | 200 normalizado, 400, 200 sin chat id                                   | `test/e2e/users/update-one-by-id.test.ts`                                                    |

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test`: unit, integration y e2e en verde.

## Fuera de alcance

Endpoints de desbloqueo, reset de MFA y verificación de cuenta; flujo de
verificación al cambiar el email (se mantiene el comportamiento actual y se
documenta); auditoría de los cambios de perfil.
