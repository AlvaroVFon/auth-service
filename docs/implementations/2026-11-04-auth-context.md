---
date: '2026-11-04'
requested_by: 'AlvaroVFon'
slug: 'auth-context'
status: 'implemented'
---

# Implementation — Bootstrap del panel con GET /auth/context

## Goal & Problem

El panel necesita una única lectura autenticada para pintar la navegación y
comprobar permisos. Hoy `GET /auth/me` solo devuelve la audiencia y el rol del
token, y `GET /applications/:id` es owner-only, así que un app admin no puede
saber qué aplicaciones administra ni con qué rol sin llamadas owner-only que le
están prohibidas. `GET /auth/context` devuelve la identidad mínima del portador,
su rol global y las aplicaciones donde tiene rol, apoyándose en los grants
activos y en el catálogo existentes.

Issue: #102.

## Decisión

- `GrantsPort.listActiveByUser(userId)` devuelve pares `{ application, role }`
  partiendo de los grants del usuario y filtrando con `findActiveByIds`, de modo
  que los grants de aplicaciones inactivas o inexistentes se descartan.
- `ProfileService.getContext(identity)` resuelve el usuario con `UsersPort` y,
  si el rol del token es `owner`, devuelve el catálogo completo con `role=owner`;
  en cualquier otro caso delega en `listActiveByUser` y devuelve el rol del grant.
- `GET /auth/context` se monta con `authenticateAny`, reutiliza `buildIdentity` y
  responde `200` con `{ user, role, applications }`. No toca `/auth/me`, no emite
  ni renueva tokens y no añade rate limit específico.
- La respuesta solo expone `id`, `email`, `verified` y `mfaEnabled` del portador,
  nunca secretos, hashes, contadores de lockout ni códigos de recuperación.

## Acceptance Criteria

- [x] Un owner autenticado recibe el catálogo completo con `role=owner`.
- [x] Un app admin recibe solo la aplicación de su grant con el rol del grant.
- [x] Un usuario sin grants recibe `applications: []` y su rol de token.
- [x] Sin token, con token caducado o revocado la respuesta es `401`.
- [x] La respuesta no incluye `mfaSecret`, `mfaPendingSecret`, códigos de
      recuperación, `password`, `loginAttempts` ni `mfaFailedAttempts`.
- [x] Un usuario inexistente provoca `EntityNotFoundError`.
- [x] `listActiveByUser` descarta grants de aplicaciones inactivas.

## Test Plan

| Case                        | Type        | Input / state                                    | Expected result                              | Test file                                             |
| --------------------------- | ----------- | ------------------------------------------------ | -------------------------------------------- | ----------------------------------------------------- |
| Owner resuelve el catálogo  | unit        | token `owner`, catálogo de dos aplicaciones      | dos aplicaciones con `role=owner`            | `test/unit/src/auth/services/profile.service.test.ts` |
| App admin resuelve su grant | unit        | token `admin`, un grant activo                   | solo esa aplicación con `role=admin`         | `test/unit/src/auth/services/profile.service.test.ts` |
| Usuario sin grants          | unit        | token `user`, sin grants                         | `applications` vacío y rol de token          | `test/unit/src/auth/services/profile.service.test.ts` |
| Usuario inexistente         | unit        | `findById` devuelve `null`                       | `EntityNotFoundError`                        | `test/unit/src/auth/services/profile.service.test.ts` |
| Campos sensibles            | unit        | usuario con `mfaSecret`, `password` y contadores | solo `id`, `email`, `verified`, `mfaEnabled` | `test/unit/src/auth/services/profile.service.test.ts` |
| Grants activos del usuario  | integration | dos grants activos y un grant de otro usuario    | solo los dos del usuario con su rol          | `test/integration/src/grants/grants.service.test.ts`  |
| Aplicación inactiva         | integration | grant sobre app desactivada después              | entrada descartada                           | `test/integration/src/grants/grants.service.test.ts`  |
| Id de usuario inválido      | integration | `userId='bad-id'`                                | `InvalidArgumentError`                       | `test/integration/src/grants/grants.service.test.ts`  |
| AC-1 owner                  | e2e         | owner con varias aplicaciones                    | `200` con todas y `role=owner`               | `test/e2e/auth/context.test.ts`                       |
| AC-2 app admin              | e2e         | grant `admin` en una app y ninguna en otra       | `200` con solo su app y `role=admin`         | `test/e2e/auth/context.test.ts`                       |
| AC-3 sin grants             | e2e         | token de usuario sin grants                      | `200` con lista vacía y rol de token         | `test/e2e/auth/context.test.ts`                       |
| AC-4 sin token              | e2e         | petición sin `Authorization`                     | `401` sin datos                              | `test/e2e/auth/context.test.ts`                       |
| AC-4 token revocado         | e2e         | access token tras logout                         | `401` sin datos                              | `test/e2e/auth/context.test.ts`                       |

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test`: 248 unit, 316 integration y 185 e2e, sin fallos.
- `test/e2e/auth/me-introspect.test.ts` sigue en verde: `/auth/me` no cambia.

## Fuera de alcance

- Cambios en `/auth/me`, `/users/:id` o `/applications`.
- Emisión o renovación de tokens y rate limit específico del endpoint.
- Filtrado por rol de grant: cualquier grant activo aparece con su rol.
