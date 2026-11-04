---
date: '2026-11-04'
requested_by: 'AlvaroVFon'
slug: 'application-lifecycle'
status: 'implemented'
---

# Implementation — Ciclo de vida de aplicaciones sin tocar MongoDB

## Goal & Problem

Crear, listar y leer aplicaciones ya existía, pero renombrar, activar/desactivar
o retirar una aplicación obligaba a editar documentos en MongoDB a mano, sin
auditoría ni contrato HTTP. La issue #122 pide exponer ese ciclo de vida al
owner conservando los grants y el rastro de auditoría.

## Decisión

`PATCH /applications/:id` admite únicamente `name` y `active`; cualquier otra
clave del payload (`slug`, `audience`, `_id`, `__v`, …) devuelve `400` sin
escribir, porque el `slug` y la `audience` identifican la aplicación en cada
token emitido. `DELETE /applications/:id` no borra: archiva (`active=false`),
conserva el documento y sus grants, y es idempotente. Cada transición se audita
como `application.updated`, `application.activated`, `application.deactivated`
o `application.archived` con el actor y el id de la aplicación.

Los grants de una aplicación archivada siguen siendo administrables por el
owner. La superficie de grants resuelve la aplicación con
`findAssignableById` (devuelve `null` para inactivas) y eso deja el contrato
correcto para el app admin: un token de aplicación o un grant `admin` sobre una
aplicación archivada recibe `403`. Para el owner, en cambio, el controller
adjunta `{ includeArchived: true }` y el servicio resuelve con `findById`, así
que `PUT`, `GET .../grants`, `GET .../grants/:userId` y
`DELETE .../grants/:userId` siguen funcionando sobre la aplicación archivada.
La alternativa de rechazar también las revocaciones se descartó porque dejaría
grants imposibles de limpiar sin volver a activar la aplicación.

El scope se modela con `GrantApplicationScope` (`application` ya resuelta por el
middleware de autorización + `includeArchived`), no con un flag global: la
decisión de "aplicación activa o archivada" queda en el llamador HTTP y el
servicio mantiene el comportamiento conservador por defecto.

`PATCH` distingue además un nombre ausente/vacío (`Name is required`) de un
nombre con tipo incorrecto (`Name must be a string`), porque `{ "name": 42 }`
anteriormente respondía "required" y ocultaba la causa real.

## Acceptance Criteria

- [x] `PATCH /applications/:id` renombra y activa/desactiva; solo `name` y
      `active` son mutables.
- [x] Un payload con `slug`, `audience`, `_id`, `__v` o vacío devuelve `400` y
      no modifica el documento.
- [x] `DELETE /applications/:id` archiva de forma idempotente y conserva el
      documento y sus grants.
- [x] Las cuatro transiciones se registran en `AuditEvent` con actor y
      aplicación.
- [x] El owner lista, asigna, lee y revoca grants de una aplicación archivada.
- [x] El app admin de una aplicación archivada recibe `403` en toda la
      superficie de grants.
- [x] `{ "name": 42 }` devuelve `400` con `Name must be a string`.
- [x] `pnpm lint`, `pnpm format:check`, `pnpm build` y `pnpm test` en verde.

## Test Plan

| Case                                 | Type        | Input / state                                | Expected result                               | Test file                                                        |
| ------------------------------------ | ----------- | -------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| Renombrar y auditar                  | integration | `{ name: '  Renamed  ' }` + `actorId`        | nombre recortado y `application.updated`      | `test/integration/src/applications/applications.service.test.ts` |
| Campos inmutables                    | integration | `slug`, `audience`, `_id`, `__v`             | `InvalidArgumentError`, documento intacto     | `test/integration/src/applications/applications.service.test.ts` |
| Nombre vacío vs. tipo incorrecto     | integration | `{ name: '' }` / `{ name: 42 }`              | `Name is required` / `Name must be a string`  | `test/integration/src/applications/applications.service.test.ts` |
| Archivar dos veces                   | integration | `archive()` dos veces                        | `active=false`, grant conservado, dos eventos | `test/integration/src/applications/applications.service.test.ts` |
| Listar grants de archivada (owner)   | integration | `listByApplication(id, { includeArchived })` | un grant                                      | `test/integration/src/grants/grants.service.test.ts`             |
| Listar grants de archivada sin scope | integration | `listByApplication(id)`                      | `EntityNotFoundError`                         | `test/integration/src/grants/grants.service.test.ts`             |
| Asignar grant en archivada (owner)   | integration | `assignRole(..., { includeArchived })`       | grant creado                                  | `test/integration/src/grants/grants.service.test.ts`             |
| Ciclo completo sobre archivada       | e2e         | `DELETE` app, luego `PUT/GET/DELETE` grants  | `200`, `200`, `204` y `404` final             | `test/e2e/grants/administration.test.ts`                         |
| App admin sobre archivada            | e2e         | grant `admin` + `DELETE` app                 | `403` en listar, leer, asignar y revocar      | `test/e2e/grants/administration.test.ts`                         |
| Nombre con tipo incorrecto por HTTP  | e2e         | `PATCH { name: 42 }`                         | `400` con `Name must be a string`             | `test/e2e/applications/lifecycle.test.ts`                        |

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test`: 242 unit, 328 integration, 188 e2e con MongoDB en local.

## Fuera de alcance

Borrado físico de aplicaciones, revocación masiva de grants o sesiones al
archivar, y reactivación de sesiones revocadas. Ver `README.md#application-lifecycle`.
