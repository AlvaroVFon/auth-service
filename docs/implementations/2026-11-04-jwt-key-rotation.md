---
date: '2026-11-04'
requested_by: 'AlvaroVFon'
slug: 'jwt-key-rotation'
status: 'implemented'
---

# Implementation — Runbook y estado observable de la rotación de claves JWT

## Goal & Problem

El `JwtKeyring` firmaba con una clave activa y verificaba las retiradas, pero
rotar exigía reconstruir el procedimiento a partir del README y de la nota de
#39: no había runbook versionado ni forma de consultar qué `kid` firmaba y qué
claves seguían aceptándose. Un operador podía retirar una clave antes de que
caducaran los refresh tokens o desplegar configuraciones distintas entre
réplicas sin detectarlo.

Issue: #106.

## Decisión

- Nuevo runbook `docs/runbooks/jwt-key-rotation.md` con las fases de generación,
  publicación, verificación, periodo de gracia, retirada y rollback, además de la
  tabla de errores de arranque y las reglas de higiene de secretos.
- `JwtKeyring.getStatus()` expone `{ activeKid, keys: [{ kid, status,
  publishedAt }] }`. Se construye desde el keyring ya validado y solo copia
  identificadores y fechas: nunca exporta `KeyObject` ni material privado. Las
  claves cuyo `kid` no es el activo se marcan como `retired`.
- `JWT_KEY_PUBLISHED_AT` y el campo opcional `publishedAt` de
  `JWT_RETIRED_PUBLIC_KEYS` permiten declarar la fecha real de publicación. Si no
  se declaran, la fecha es el instante de carga del keyring, que es lo único que
  el proceso conoce con certeza. Ambas fechas se validan al construir el keyring.
- `GET /jwks/status` es owner-only (`authenticate` +
  `allowRoles(Roles.OWNER)`), responde `Cache-Control: no-store` y no admite
  escrituras. El JWKS público `/.well-known/jwks.json` no cambia.
- `JwksModule` pasa a recibir dependencias en un objeto, como `AuditModule`, para
  montar la ruta protegida con los middlewares compartidos. La composición crea
  el módulo después de construir la autenticación.

## Acceptance Criteria

- [x] AC-1: el runbook cubre la rotación completa desde una clave vacía y
      incluye verificación y rollback.
- [x] AC-2: `/jwks/status` devuelve el `kid` activo, los retirados y su fecha de
      publicación, sin material de clave.
- [x] AC-3: el rollback documentado reutiliza la configuración anterior y
      conserva la clave fallida en retirados, sin downtime.
- [x] AC-4: el runbook mantiene y explica el rechazo de claves efímeras en
      producción.
- [x] AC-5: el estado de claves tiene tests unitarios, de configuración y e2e.

## Test Plan

| Case                         | Type | Input / state                                   | Expected result                               | Test file                                    |
| ---------------------------- | ---- | ----------------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| Estado con activa y retirada | unit | Keyring con `publishedAt` explícito             | `activeKid`, estados y fechas; sin PEM        | `test/unit/src/libs/jwt/jwt-keyring.test.ts` |
| Fecha por defecto            | unit | Keyring sin `publishedAt`                       | Fecha entre antes y después de construir      | `test/unit/src/libs/jwt/jwt-keyring.test.ts` |
| Fecha inválida               | unit | `publishedAt: 'not-a-date'`                     | `InvalidArgumentError`                        | `test/unit/src/libs/jwt/jwt-keyring.test.ts` |
| Respuesta del estado         | unit | Controlador con keyring mixto                   | `200`, `no-store`, sin clave privada          | `test/unit/src/jwks/jwks.controller.test.ts` |
| Configuración de fechas      | unit | `JWT_KEY_PUBLISHED_AT` + `publishedAt` retirada | Estado con fechas declaradas                  | `test/unit/src/config/jwt.config.test.ts`    |
| Configuración inválida       | unit | Fechas no ISO en activa o retirada              | `InvalidArgumentError`                        | `test/unit/src/config/jwt.config.test.ts`    |
| Autorización del endpoint    | e2e  | Sin token / token de usuario                    | `401` / `403`                                 | `test/e2e/jwks.test.ts`                      |
| Estado coherente con el JWKS | e2e  | Token de owner                                  | `200`, mismos `kid` que el JWKS, sin material | `test/e2e/jwks.test.ts`                      |

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test`: 248 unit, 312 integration, 182 e2e.
- MongoDB local con `MONGO_URI=mongodb://127.0.0.1:27017/auth_db_test` porque
  `localhost` resuelve a `::1` en el entorno de ejecución.

## Estabilización colateral

`test/unit/src/links/link-notifications.service.test.ts` fallaba de forma
intermitente (2 de 3 ejecuciones) también en `origin/main`: el temporizador de
`LinkNotificationsService.withTimeout` es `unref`, así que al ejecutar el archivo
aislado el event loop se vaciaba antes de los 20 ms y el test quedaba cancelado.
El test mantiene ahora un temporizador vivo mientras espera la cancelación; el
servicio no cambia.

## Fuera de alcance

Rotación automática, edición o visualización de claves desde el panel, endpoints
de escritura, cambios en el rechazo de claves efímeras en producción y stores
distribuidos para la blacklist o el rate limiting.
