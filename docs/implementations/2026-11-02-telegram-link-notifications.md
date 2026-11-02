# Notificaciones de invitaciones y reset por Telegram

Fecha: 2026-11-02
Issue: #51 — Notificar invitaciones y resets por Telegram

## Contexto

Los enlaces de invitación y reset se generaban y se copiaban a mano. El hogar no tiene
SMTP, así que se añade Telegram como canal de entrega sin quitar la posibilidad de
copiar el enlace.

## Decisión

- `TELEGRAM_BOT_TOKEN` activa la integración. Sin él, el servicio de notificaciones
  queda desactivado y los endpoints siguen devolviendo el enlace.
- `TELEGRAM_OWNER_CHAT_ID` fija el chat del owner; si no está, se usa el
  `telegramChatId` del `User` con rol `owner`.
- El invitado puede indicar su chat en `POST /applications/:applicationId/invitations`
  con un `telegramChatId` opcional (solo dígitos, admite negativos). Se guarda en el
  enlace y se copia al usuario creado al aceptar, para que los resets posteriores
  lleguen al mismo chat.
- Los resets usan el `telegramChatId` del usuario y, si no existe, el del owner.
- Orden de destinatario: chat explícito del invitado → `TELEGRAM_OWNER_CHAT_ID` → chat
  del `User` owner → omitir.
- La entrega es best-effort: se espera con timeout (`TELEGRAM_TIMEOUT_MS`, 3000 ms por
  defecto) y cualquier error o timeout se registra como warning, pero la creación del
  enlace responde `201` con el enlace utilizable.
- La respuesta incluye `notification: { delivered, recipient }`, donde `recipient` es
  `invitee`, `owner` o `null`.
- El adaptador de Telegram envía a `https://api.telegram.org/bot<token>/sendMessage`
  con `AbortSignal.timeout`. Cualquier fallo se convierte en `TelegramDeliveryError`
  con mensaje fijo: nunca adjunta la causa original (la URL contiene el token).

## Configuración

| Variable                 | Efecto                                             |
| ------------------------ | -------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`     | Activa el bot; vacío = notificaciones desactivadas |
| `TELEGRAM_OWNER_CHAT_ID` | Chat del owner (fallback)                          |
| `TELEGRAM_TIMEOUT_MS`    | Timeout de entrega (positivo, 3000 por defecto)    |

El chat de un usuario se configura con `PATCH /users/:id` (owner):
`{ "telegramChatId": "4242" }`.

## Logs

Nunca se registran el enlace, el token, el chat ni el email. Solo se registran el tipo
de notificación, el id del enlace (ObjectId) y el destinatario (`invitee`/`owner`) en
éxito o fallo.

## Migración y despliegue

- `User.telegramChatId` y `Link.telegramChatId` son campos opcionales y aditivos; no
  requieren migración.
- Rollback: quitar `TELEGRAM_BOT_TOKEN` (las notificaciones se omiten en silencio) o
  revertir el wiring. Los enlaces siguen funcionando y se pueden copiar.

## Fuera de alcance

- Interactividad del bot (comandos, webhooks, deep links).
- Verificar que el chat indicado pertenece realmente al invitado.
- Reintentos/outbox para entregas fallidas, cuotas o rate limiting de salida.
- Notificaciones de seguridad distintas de invitaciones y resets.

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test:unit`: configuración, adaptador (URL, timeout, saneado de errores),
  normalización de chat id y resolución/entrega de notificaciones sin fugas.
- `pnpm test:integration`: chat del invitado, fallback al owner, fallo del bot, copia
  del chat al aceptar y resets.
- `pnpm test:e2e`: AC-1 a AC-4 sobre HTTP, incluido el fallo del bot.
