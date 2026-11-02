# Invitaciones y reset mediante enlace compartible

Fecha: 2026-11-02
Issue: #43 — Invitaciones y reset mediante enlace compartible

## Contexto

El alta de usuarios y el reset dependían de SMTP, que no está disponible en el hogar, y
el reset solo emitía códigos de 6 caracteres. El owner necesita generar enlaces de un
solo uso y compartirlos por el canal que prefiera.

## Decisión

- Nueva colección `Link` para enlaces de un solo uso. Guarda únicamente el SHA-256 del
  token (`tokenHash`), nunca el token en claro. El token se genera con 32 bytes
  aleatorios en base64url y se devuelve al llamante dentro de la URL.
- Dos tipos: `invitation` (email + aplicación + rol) y `password_reset` (userId).
- El consumo es atómico (`findOneAndUpdate` con `usedAt: null` y `expiresAt > now`), por
  lo que un enlace solo se acepta una vez, incluso con peticiones concurrentes. Los
  índices TTL limpian los caducados y la caducidad se comprueba siempre en la consulta.
- Reemitir un enlace invalida los anteriores del mismo asunto (email + app para
  invitaciones; usuario para reset).
- `POST /applications/:applicationId/invitations` (owner o admin de esa app) crea la
  invitación. Rechaza emails que ya tengan usuario o holder, para que un enlace no
  pueda cambiar la contraseña de una cuenta existente.
- `POST /auth/invitations/accept` (público) valida la contraseña, consume el enlace,
  crea el usuario verificado y asigna el grant indicado. Si la asignación falla, borra
  el usuario y libera el enlace (compensación; MongoDB standalone no tiene
  transacciones).
- `POST /auth/password-reset-links` es owner-only y recibe `userId`, por lo que no
  enumera emails. `POST /auth/password-reset-links/accept` (público) fija la contraseña
  una vez y revoca las sesiones del usuario.
- AC-5 se mantiene en `POST /auth/forgot-password`: exista o no la cuenta, responde
  `204` con el mismo cuerpo vacío.

## API

| Método | Ruta                                       | Autorización      | Respuesta                            |
| ------ | ------------------------------------------ | ----------------- | ------------------------------------ |
| `POST` | `/applications/:applicationId/invitations` | owner / app admin | `201` enlace / `400` / `403` / `404` |
| `POST` | `/auth/invitations/accept`                 | pública           | `204` / `400`                        |
| `POST` | `/auth/password-reset-links`               | owner             | `201` enlace / `400` / `404`         |
| `POST` | `/auth/password-reset-links/accept`        | pública           | `204` / `400`                        |

`400 INVALID_LINK` cubre enlaces caducados, usados, desconocidos o de otro tipo.

## Configuración

- `PUBLIC_APP_URL`: base de los enlaces (`/invitations/accept?token=...` y
  `/reset-password?token=...`).
- `INVITATION_LINK_EXPIRATION_MS` (por defecto 7 días).
- `PASSWORD_RESET_LINK_EXPIRATION_MS` (por defecto 1 hora).

## Seguridad y despliegue

- Los tokens no se registran ni se guardan en claro; solo se devuelven al creador.
- Los endpoints de aceptación son públicos y solo usan el limitador global.
- Despliegue: crear la colección e índices (`tokenHash` único y TTL en `expiresAt`). Si
  `autoIndex` está desactivado en producción, crearlos manualmente.
- Rollback: retirar rutas y módulo; la colección `links` puede eliminarse. No se
  modifican documentos existentes.

## Fuera de alcance

- Envío automático de enlaces por email o Telegram (el owner los comparte).
- Eliminar los flujos existentes de verificación por código y `/auth/forgot-password`.
- Invitar a un usuario ya registrado a otra app (se usan grants).
- Páginas frontend de aceptación y listado/revocación de enlaces.

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test:unit`: generación/hash de tokens, URLs y configuración.
- `pnpm test:integration`: persistencia, un solo uso concurrente, caducidad, invalidación
  y compensación de invitaciones/reset.
- `pnpm test:e2e`: AC-1 a AC-5, permisos owner/app admin, replay, caducidad y ausencia de
  cuenta antes de aceptar.
