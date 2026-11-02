# Sesiones independientes por dispositivo

Fecha: 2026-11-02
Issue: #45 — Sesiones independientes por dispositivo

## Contexto

Cada login revocaba todos los refresh tokens del usuario. Entrar desde el móvil cerraba
la sesión del ordenador, y no había forma de ver ni revocar sesiones concretas.

## Decisión

- Cada login crea una sesión independiente identificada por un `sessionId` (UUID)
  persistido en `RefreshToken` junto con IP, user-agent, audiencia, `createdAt`,
  `lastActivityAt` y `expiresAt`. El login deja de revocar las sesiones anteriores.
- La rotación mantiene el `sessionId` de la sesión: se revoca el `jti` presentado y se
  crea el nuevo refresh token dentro de la misma sesión, actualizando
  `lastActivityAt`. Los tokens antiguos sin `sessionId` usan su `jti` como respaldo.
- `GET /auth/sessions` lista las sesiones activas y no expiradas del usuario con
  `id`, `device`, `application`, `ipAddress`, `createdAt`, `lastActivityAt` y
  `expiresAt`.
- `DELETE /auth/sessions/:sessionId` revoca solo esa sesión; un id desconocido o de
  otro usuario responde `404`.
- `DELETE /auth/sessions` revoca todas las sesiones del usuario (`204`).
- Los endpoints aceptan tokens con o sin audiencia, pero siempre operan sobre el
  usuario autenticado: nunca se pueden listar ni revocar sesiones ajenas.
- `POST /auth/logout` conserva el comportamiento previo (revoca todas las sesiones y
  blacklistea el access token jti presentado).

## API

| Método   | Ruta                        | Respuesta                       |
| -------- | --------------------------- | ------------------------------- |
| `GET`    | `/auth/sessions`            | `200` lista de sesiones / `401` |
| `DELETE` | `/auth/sessions/:sessionId` | `204` / `401` / `404`           |
| `DELETE` | `/auth/sessions`            | `204` / `401`                   |

## Migración y despliegue

El nuevo campo `sessionId` tiene un valor por defecto, así que los refresh tokens
antiguos siguen funcionando y la rotación los migra a una sesión con `sessionId` = su
`jti`. No se requiere script de migración. Rollback: las versiones antiguas ignoran los
campos nuevos y siguen revocando todo en cada login.

## Fuera de alcance

- Revocación de access tokens al revocar una sesión (siguen válidos hasta `exp`).
- Refresh público y blacklist de access tokens.
- Cambiar `logout` para que cierre solo la sesión actual.

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test:unit`: creación sin revocar, conservación de `sessionId` en la rotación,
  mapeo de sesiones y revocación individual.
- `pnpm test:integration`: persistencia de sesión/audiencia, listado activo, revocación
  selectiva y errores de sesión inexistente.
- `pnpm test:e2e`: AC-1 a AC-4, aislamiento entre usuarios y autenticación requerida.
