# Auditoría de eventos de autenticación

Fecha: 2026-11-02
Issue: #53 — Registrar auditoría de eventos de autenticación

## Contexto

No había rastro de logins, fallos, bloqueos, revocaciones ni cambios de permisos, así
que investigar un acceso o un cambio de rol requería cruzar logs de aplicación.

## Decisión

- Nueva colección `AuditEvent` con `event`, `result`, `userId`/`email`,
  `applicationId`/`audience`, `role`, `actorId`, `targetUserId`, `ipAddress`,
  `userAgent` y `createdAt`.
- Se registran: login correcto/fallido, cuenta bloqueada, refresh correcto, logout,
  revocación de una sesión o de todas, y asignación/revocación de grants.
- Los eventos solo guardan identificadores y metadatos: nunca contraseñas, tokens,
  códigos ni enlaces.
- `AuditService.record` es best-effort: captura cualquier error de escritura y lo
  registra como warning, de modo que la auditoría nunca rompe el flujo de auth.
- `GET /audit-events` es owner-only y filtra por `userId`, `email`, `applicationId`,
  `event`, `from`, `to` y `limit` (máximo 200, por defecto 50). El listado va ordenado
  por fecha descendente.
- Retención mediante índice TTL en `createdAt` con `AUDIT_RETENTION_DAYS` (90 días por
  defecto).
- Los cambios de permisos registran `actorId` (quien ejecuta), `targetUserId` (a quién),
  `applicationId` y `role`.

## API

| Método | Ruta            | Autorización | Respuesta                           |
| ------ | --------------- | ------------ | ----------------------------------- |
| `GET`  | `/audit-events` | owner        | `200` lista / `400` / `401` / `403` |

## Seguridad y despliegue

- Los tokens de aplicación no pueden consultar la auditoría (`authenticate` solo acepta
  tokens globales y `allowRoles(owner)`).
- No se persisten secretos; el `toJSON` no expone `__v`.
- Despliegue: crear la colección y sus índices (TTL en `createdAt`). Si `autoIndex` está
  desactivado en producción, crearlos manualmente.
- Rollback: retirar el módulo y las rutas; la colección `audit_events` puede eliminarse.
  No se modifica ningún documento existente.

## Fuera de alcance

- Alertas en tiempo real y exportación.
- Auditoría de accesos a datos de usuario o de operaciones administrativas distintas de
  los grants.
- Firma o inmutabilidad criptográfica de los eventos.

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test:unit`: saneado, best-effort y filtros/validación de consultas.
- `pnpm test:integration`: registro de eventos y persistencia.
- `pnpm test:e2e`: AC-1 a AC-5, filtros, permisos y ausencia de secretos.
