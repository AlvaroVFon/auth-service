---
date: '2026-11-04'
requested_by: 'AlvaroVFon'
slug: 'application-settings-model'
status: 'implemented'
---

# Implementation — Modelo del subdocumento de settings en Application

## Goal & Problem

`Application` solo describía identidad (nombre, slug, audience y estado), así que
no había forma de expresar overrides por aplicación de TTL de tokens, política
MFA, límite de sesiones, verificación de email, TTL de invitaciones o nombre
visible. Sin ese modelo no se puede resolver precedencia ni cachear settings.

Issue: #129.

## Decisión

- Nuevo módulo `src/settings` con `ApplicationSettings`,
  `ApplicationSettingsInput`, la enumeración `MfaPolicy`
  (`optional`/`required`/`disabled`) y la validación compartida
  `validateApplicationSettings`, que lanza `InvalidArgumentError` con un mensaje
  por campo.
- Rango validado: los TTL (`accessTokenTtl`, `refreshTokenTtl`,
  `invitationTtlMs`) son enteros no negativos; `maxSessionsPerUser` es un entero
  positivo; `mfaPolicy` debe pertenecer al enum; `requireVerifiedEmail` debe ser
  booleano y `appName` no puede estar vacío.
- `settings` es un subdocumento opcional (`required: false`, `_id: false`) sin
  `required` ni `defaults` en ningún campo: la ausencia es un estado válido y
  significa herencia.
- El schema reutiliza los predicados de `settings.validation`, de modo que la
  escritura directa con el modelo y la validación de dominio coinciden.
- Los tipos se exportan desde `src/settings/index.ts` y desde
  `src/applications/index.ts`.

## Acceptance Criteria

- [x] Una aplicación sin `settings` se guarda y se lee con `settings` undefined.
- [x] Los settings parciales se persisten y se devuelven exactamente igual.
- [x] `accessTokenTtl`/`refreshTokenTtl`/`invitationTtlMs` negativos,
      `mfaPolicy` desconocido y `maxSessionsPerUser` cero se rechazan con error de
      validación y no dejan documento.
- [x] Ningún campo de `settings` es `required` ni tiene `default`.

## Test Plan

| Case                                | Type        | Input / state                       | Expected result                  | Test file                                                        |
| ----------------------------------- | ----------- | ----------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| Settings completos                  | unit        | objeto con los siete campos         | se devuelve tal cual             | `test/unit/src/settings/settings.validation.test.ts`             |
| Herencia vacía                      | unit        | `{}` / `undefined` / `null`         | `{}` / `undefined`               | `test/unit/src/settings/settings.validation.test.ts`             |
| TTL negativo, decimal o no numérico | unit        | `-1`, `1.5`, `'soon'`               | `InvalidArgumentError` por campo | `test/unit/src/settings/settings.validation.test.ts`             |
| `mfaPolicy` desconocido             | unit        | `'always'`                          | `InvalidArgumentError`           | `test/unit/src/settings/settings.validation.test.ts`             |
| `maxSessionsPerUser` no positivo    | unit        | `0`, `-3`                           | `InvalidArgumentError`           | `test/unit/src/settings/settings.validation.test.ts`             |
| Schema sin `required` ni `default`  | unit        | inspección de `ApplicationModel`    | todos opcionales, sin defaults   | `test/unit/src/applications/applications.schema.test.ts`         |
| Persistencia parcial                | integration | TTL, `mfaPolicy` y `appName`        | se leen igual                    | `test/integration/src/applications/application-settings.test.ts` |
| Persistencia completa               | integration | los siete campos                    | se leen igual                    | `test/integration/src/applications/application-settings.test.ts` |
| Settings inválidos                  | integration | TTL negativo, policy desconocido, 0 | `ValidationError`, sin documento | `test/integration/src/applications/application-settings.test.ts` |
| Aplicación sin settings             | integration | documento sin `settings`            | válido y `settings` undefined    | `test/integration/src/applications/application-settings.test.ts` |

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test`: 262 unit, 320 integration, 180 e2e.

## Fuera de alcance

Resolver la precedencia de settings (#130), cachear el resultado (#131),
sembrar settings globales (#132) y exponer endpoints de settings (#149, #150,
#151).
