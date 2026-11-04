# Admin panel — inventario de API y brechas de management

> Estado: análisis previo al diseño del panel. No implementa nada.
> Fecha: 2026-11-04
> Alcance: superficie HTTP actual, reutilización desde el panel y endpoints que
> faltan para operar el servicio sin tocar MongoDB ni variables de entorno.

---

## 1. Resumen ejecutivo

La API expone **36 rutas** que cubren bien el ciclo de autenticación, pero la
superficie de administración está pensada para un owner con `curl`, no para un
panel:

- **No hay ciclo de vida de aplicaciones.** Se pueden crear y leer, pero no
  renombrar, activar ni desactivar (`PATCH`/`DELETE` no existen).
- **No hay configuración por aplicación.** Todo (TTL de tokens, MFA, lockout,
  sesiones, códigos, rate limits) vive en variables de entorno globales y se
  resuelve al arrancar. `Application` solo tiene `name`, `slug`, `audience` y
  `active`.
- **No hay endpoints de settings.** Ni globales ni por app. Cambiar cualquier
  política exige redeploy.
- **El panel de un app admin es inviable hoy.** `GET /applications/:id` y
  `GET /users` son owner-only; un `admin` de aplicación no puede leer su propia
  app ni buscar usuarios para asignar grants.
- **Las colecciones no paginan.** `GET /users`, `GET /applications`,
  `GET /audit-events` y `GET /.../grants` devuelven todo (audit con tope de
  200). Un panel necesita búsqueda, paginación y contadores.
- **Faltan operaciones de soporte al usuario.** Desbloquear, resetear MFA,
  forzar verificación, revocar sesiones ajenas o ver el estado de seguridad no
  tienen endpoint diseñado. Parte se puede hacer con `PATCH /users/:id`, pero
  es un atajo peligroso (ver §7).
- **No hay vista de "mis aplicaciones".** Tras el login, el panel no sabe qué
  apps puede administrar el usuario; `GET /auth/me` devuelve un único rol y una
  única audiencia.
- **No hay dashboard.** No existen agregados de usuarios, apps, sesiones,
  bloqueos o logins.

Conclusión: el panel se puede empezar en modo **solo lectura** reutilizando lo
existente, pero para que sea realmente útil hacen falta ~18 endpoints nuevos y
un cambio de modelo (settings por aplicación). El orden recomendado está en §8.

---

## 2. Inventario actual (36 rutas)

Leyenda de acceso: **P** público, **A** autenticado, **O** owner, **AA** owner
o admin de la aplicación del path.

### 2.1 Probes y claves

| Método | Ruta                     | Acceso | Uso en el panel                             |
| ------ | ------------------------ | ------ | ------------------------------------------- |
| GET    | `/health`                | P      | Estado del servicio                         |
| GET    | `/ready`                 | P      | Estado de MongoDB                           |
| GET    | `/.well-known/jwks.json` | P      | `kid`s publicados / rotación (solo lectura) |

Suficiente para una pantalla de estado. No hay endpoint para rotar claves y
**no debería haberlo** desde el panel sin un runbook (ver §9).

### 2.2 Autenticación y sesiones (`/auth/*`)

| Método | Ruta                        | Acceso | Uso en el panel                           |
| ------ | --------------------------- | ------ | ----------------------------------------- |
| POST   | `/auth/signup`              | P      | Flujo público; no es del panel            |
| POST   | `/auth/verify`              | P      | Flujo público; no es del panel            |
| POST   | `/auth/login`               | P      | Login del panel                           |
| POST   | `/auth/refresh`             | P      | Renovación de sesión del panel            |
| POST   | `/auth/logout`              | A      | Cierre de sesión                          |
| POST   | `/auth/forgot-password`     | P      | Recuperación del owner/admin              |
| POST   | `/auth/reset-password`      | P      | Recuperación del owner/admin              |
| GET    | `/auth/me`                  | A      | Bootstrap de identidad (insuficiente, §5) |
| POST   | `/auth/introspect`          | A      | Diagnóstico de tokens propios             |
| GET    | `/auth/sessions`            | A      | Sesiones propias                          |
| DELETE | `/auth/sessions/:sessionId` | A      | Revocar sesión propia                     |
| DELETE | `/auth/sessions`            | A      | Revocar todas las propias                 |
| POST   | `/auth/mfa/enroll`          | A      | Enrolar MFA del propio usuario            |
| POST   | `/auth/mfa/activate`        | A      | Activar MFA del propio usuario            |
| POST   | `/auth/mfa/verify`          | P      | Segundo factor en login                   |
| POST   | `/auth/mfa/disable`         | A      | Desactivar MFA propio                     |

### 2.3 Enlaces e invitaciones

| Método | Ruta                                       | Acceso | Uso en el panel               |
| ------ | ------------------------------------------ | ------ | ----------------------------- |
| POST   | `/applications/:applicationId/invitations` | AA     | Invitar miembro a una app     |
| POST   | `/auth/invitations/accept`                 | P      | Flujo público                 |
| POST   | `/auth/password-reset-links`               | O      | Generar reset para un usuario |
| POST   | `/auth/password-reset-links/accept`        | P      | Flujo público                 |

No hay listado, reenvío ni revocación de invitaciones o enlaces. El panel no
puede mostrar "invitaciones pendientes" ni corregir un email mal escrito.

### 2.4 Usuarios, aplicaciones y grants

| Método | Ruta                                          | Acceso | Uso en el panel                        |
| ------ | --------------------------------------------- | ------ | -------------------------------------- |
| POST   | `/users`                                      | O      | Crear usuario verificado               |
| GET    | `/users`                                      | O      | Listar usuarios (sin paginar)          |
| GET    | `/users/:id`                                  | O      | Detalle de usuario                     |
| PATCH  | `/users/:id`                                  | O      | Editar perfil (ver §7)                 |
| DELETE | `/users/:id`                                  | O      | Borrar usuario (no owner)              |
| POST   | `/applications`                               | O      | Crear aplicación                       |
| GET    | `/applications`                               | O      | Listar aplicaciones (sin paginar)      |
| GET    | `/applications/:id`                           | O      | Detalle de aplicación (owner-only)     |
| PUT    | `/applications/:applicationId/grants`         | AA     | Asignar rol por `userId`               |
| GET    | `/applications/:applicationId/grants`         | AA     | Listar grants (solo `userId` + `role`) |
| GET    | `/applications/:applicationId/grants/:userId` | AA     | Leer un grant                          |
| DELETE | `/applications/:applicationId/grants/:userId` | AA     | Revocar grant                          |

### 2.5 Auditoría

| Método | Ruta            | Acceso | Uso en el panel                                    |
| ------ | --------------- | ------ | -------------------------------------------------- |
| GET    | `/audit-events` | O      | Log de eventos (filtros, sin paginación, máx. 200) |

---

## 3. Qué necesita el panel y qué falta

### 3.1 Bootstrap y navegación

**Necesita:** saber quién soy, si soy owner global y qué aplicaciones puedo
administrar (y con qué rol).

**Hoy:** `GET /auth/me` devuelve `{ id, email, application, role, expiresAt }`.
Para un owner: `role=owner`, `application=null`. Para un app admin:
`role=admin`, `application=<audience>`, sin `applicationId` ni nombre. El panel
tendría que adivinar la app por audiencia y no puede leerla (owner-only).

**Falta:**

- `GET /auth/context` (o ampliar `/auth/me`) con:
  `{ user: { id, email, verified, mfaEnabled }, globalRole, applications: [{ id, name, slug, audience, active, role }] }`.
  Para owner, `applications` = todas con `role: "owner"`.

### 3.2 Dashboard

**Necesita:** usuarios totales/verificados/bloqueados, apps activas/inactivas,
miembros por app, sesiones activas, logins correctos/fallidos últimas 24 h/7 d,
invitaciones pendientes.

**Hoy:** nada. El cliente tendría que descargar todas las colecciones y contar.

**Falta:** `GET /admin/overview` (owner) con agregados. Opcional:
`GET /applications/:id/overview` (AA) limitado a su app.

### 3.3 Aplicaciones

**Necesita:** crear, renombrar, activar/desactivar, editar settings, ver
miembros e invitaciones, y (quizá) archivar.

**Hoy:** solo `POST`, `GET` (lista) y `GET /:id` owner-only.

**Falta:**

- `PATCH /applications/:id` (O): `name` y `active`. Recomendado dejar
  `slug` y `audience` **inmutables**: cambiarlos invalida logins y tokens vivos.
- `DELETE /applications/:id` (O): archivar (`active=false`) por defecto;
  borrado físico solo sin grants ni sesiones, o nunca. Decisión pendiente.
- `GET /applications/:id` accesible también para **AA** de esa app.
- `GET /applications/:id/members` (AA): grants enriquecidos con
  `{ userId, email, username, verified, mfaEnabled, role, createdAt, lastLoginAt }`.
- `POST /applications/:id/members` (AA): `{ email, role }`. Resuelve el usuario
  por email; si no existe, crea una invitación (idempotente). Evita el flujo
  actual "busca el id en `/users`, luego `PUT`".
- `PATCH /applications/:id/members/:userId` (AA): cambiar rol.
- `DELETE /applications/:id/members/:userId` (AA): ya existe como grant delete;
  puede mantenerse el alias.
- Settings por aplicación: ver §4 y §6.
- `POST /applications/:id/sessions/revoke` (AA): cerrar todas las sesiones de
  la app (útil al desactivar o tras un incidente).

### 3.4 Usuarios

**Necesita:** listar/buscar/paginar, ver detalle con estado de seguridad,
desbloquear, resetear MFA, forzar verificación, revocar sesiones, ver grants,
enviar reset.

**Hoy:** CRUD básico owner-only. `toJSON` oculta `lockoutUntil`,
`loginAttempts`, `mfaFailedAttempts`, `mfaLockoutUntil`, etc. No hay
`lastLoginAt`. No hay operaciones de soporte.

**Falta:**

- Paginación y búsqueda por email/username en `GET /users`.
- `GET /users/:id/security` (O): `{ verified, mfaEnabled, loginAttempts,
  lockoutUntil, mfaLockoutUntil, lastLoginAt, activeSessions }`.
  Alternativa: incluir un bloque `security` solo en respuestas owner.
- `POST /users/:id/unlock` (O): limpia `loginAttempts`, `lockoutUntil`,
  `mfaFailedAttempts` y `mfaLockoutUntil`. Auditar.
- `POST /users/:id/mfa/reset` (O): desactiva MFA, borra secreto/códigos y
  revoca sesiones. Auditar. Necesario cuando el usuario pierde TOTP y
  recovery codes (hoy no hay flujo).
- `POST /users/:id/verify` (O): marca `verified=true` para altas manuales.
- `GET /users/:id/sessions` y `DELETE /users/:id/sessions` (O/AA acotado a su
  app): sesiones de un usuario.
- `GET /users/:id/grants` (O): aplicaciones y roles de un usuario.
- Ya existe `POST /auth/password-reset-links { userId }`; el panel puede
  reutilizarlo.

### 3.5 Grants / miembros

**Necesita:** ver miembros con datos legibles, asignar por email, cambiar rol,
revocar, y que un app admin pueda hacerlo sin ser owner.

**Hoy:** `GET .../grants` devuelve solo `userId` y `role`; para resolver el email
hace falta `GET /users/:id`, que es owner-only. Un app admin no puede pintar la
tabla de miembros.

**Falta:** el bloque `members` de §3.3. Los endpoints `grants` pueden quedarse
como API de bajo nivel o deprecarse.

### 3.6 Invitaciones y enlaces

**Necesita:** listar pendientes, reenviar, revocar, ver caducidad y estado.

**Hoy:** solo crear y aceptar. El modelo `OneTimeLink` ya guarda `usedAt`,
`invalidatedAt` y `expiresAt`, pero no se exponen.

**Falta:**

- `GET /applications/:id/invitations` (AA): `{ id, email, role, expiresAt,
  usedAt, invalidatedAt, createdAt }`.
- `DELETE /applications/:id/invitations/:id` (AA): invalidar.
- `POST /applications/:id/invitations/:id/resend` (AA): nueva invitación e
  invalidación de la anterior.
- `GET /auth/password-reset-links` y `DELETE /auth/password-reset-links/:id`
  (O) si se quiere gestionar resets. Menos prioritario.

### 3.7 Auditoría

**Necesita:** tabla filtrable, paginada, con emails legibles y export.

**Hoy:** filtros correctos (`userId`, `applicationId`, `event`, `from`, `to`),
pero sin paginación, máximo 200 y solo ObjectIds. No hay catálogo de eventos ni
export.

**Falta:**

- Paginación por cursor (`createdAt` + `_id`) o `page`/`limit` con `total`.
- `GET /audit-events/events` (O): catálogo de eventos para el filtro.
- Enriquecimiento opcional con `actorEmail`/`targetEmail` (una agregación o
  lookup; cuidado con el coste).
- Export CSV (`GET /audit-events/export`) opcional.
- Nuevos eventos de management: ver §7.3.

### 3.8 Settings

**Necesita:** ver y editar políticas globales y por aplicación.

**Hoy:** no existe nada. Todo es entorno.

**Falta:** `GET/PATCH /settings` (global) y
`GET/PATCH /applications/:id/settings`. Ver §4 y §6.

---

## 4. Configuración por aplicación: el bloqueo principal

Hoy la configuración se lee al construir la composición
(`src/config/application.composition.ts`) y se inyecta como números en los
servicios. No hay forma de que dos apps tengan políticas distintas.

### 4.1 Qué tiene sentido por aplicación

| Política                               | ¿Por app?       | Motivo                                                    |
| -------------------------------------- | --------------- | --------------------------------------------------------- |
| TTL de access token                    | Sí              | Cada app tiene riesgo y UX distintos                      |
| TTL de refresh token                   | Sí              | Sesiones más largas en apps internas                      |
| MFA (`disabled`/`optional`/`required`) | Sí              | Una app interna puede exigirlo; otra no                   |
| `maxSessionsPerUser`                   | Sí              | Dispositivos por app                                      |
| `requireVerifiedEmail`                 | Sí              | Apps internas pueden aceptar cuentas sin verificar        |
| TTL de invitación                      | Sí              | Operativa de cada app                                     |
| Branding (`appName`, remitente)        | Sí              | Emails y entrada de autenticador por app (parcial)        |
| Intentos y duración de lockout         | **No** (fase 1) | El lockout es de cuenta y ocurre antes de resolver la app |
| Longitud/caducidad del código          | Global          | El flujo de signup no conoce app                          |
| Rate limits por ruta                   | **No** (fase 1) | Limitadores creados al arrancar; requieren refactor       |
| Retención de auditoría                 | Global          | Índice TTL; cambiarlo requiere `collMod`                  |
| Claves JWT, SMTP, CORS, MONGO_URI      | Global          | Secretos y arranque; nunca desde el panel                 |

### 4.2 Por qué el lockout por app es caro

`AuthService.login` llama primero a `usersService.verifyCredentials(email,
password)` sin saber la app. El contador `loginAttempts` es de la cuenta. Para
tener lockout por app habría que:

1. Resolver la app antes de verificar credenciales (hoy se resuelve después).
2. Guardar contadores por `(userId, applicationId)` en otra colección.
3. Decidir si un lockout en una app bloquea el login global (mala UX) o solo
   esa app (más justo, más complejo).

Recomendación: **mantener el lockout global** y exponerlo como configuración
global. Si en el futuro se quiere por app, hacerlo como fase separada.

### 4.3 Modelo propuesto

Opción A (recomendada): subdocumento en `Application`.

```ts
interface ApplicationSettings {
  accessTokenTtl?: number; // segundos; null = heredar global
  refreshTokenTtl?: number;
  mfaPolicy?: 'disabled' | 'optional' | 'required';
  maxSessionsPerUser?: number;
  requireVerifiedEmail?: boolean;
  invitationTtlMs?: number;
  appName?: string;
}
```

Opción B: colección `ApplicationSettings` con `applicationId` único. Útil si se
esperan muchas políticas y auditoría por campo, pero añade una lectura por
request.

Con A se resuelve en la misma query que ya hace `findAssignableById`. Con un
`SettingsService` que cachea por app (TTL corto, invalidación al `PATCH`).

### 4.4 Cambios de código necesarios

- `JwtService.signTokenPair` y `signAccessToken` deben aceptar overrides de TTL
  por llamada. Hoy el TTL es de instancia.
- `SessionService.create/rotate` debe recibir la política resuelta.
- `AuthService.login/refresh/verifyMfa` debe resolver settings de la app antes
  de emitir tokens y aplicar `mfaPolicy`.
- `MfaService`/`AuthService` deben decidir si `required` fuerza enrolamiento
  (nuevo tipo de respuesta en login) y si `disabled` ignora `mfaEnabled`.
- `InvitationsService` debe recibir el TTL por app.
- `UsersService` puede quedarse con lockout global.
- Los rate limiters y `CodesService` requieren un proveedor de settings si se
  quieren dinámicos; se recomienda fase 2.

**Riesgo:** los tokens ya emitidos conservan su `exp`; bajar el TTL no acorta
sesiones vivas. Un cambio de `mfaPolicy` a `required` no afecta a tokens ya
emitidos. Documentarlo en la UI.

---

## 5. Seguridad y modelo de acceso del panel

- **Reutilizar la API, no duplicarla.** Las rutas nuevas deben colgar de los
  recursos existentes (`/applications/:id/...`, `/users/:id/...`) y reutilizar
  `AuthenticationMiddleware` + `ApplicationAuthorizationMiddleware`. Un árbol
  `/admin/*` paralelo duplicaría reglas y es fácil de olvidar.
- **Owner vs app admin.** El owner ve todo. Un app admin solo debe ver su app,
  sus miembros y sus invitaciones, con una proyección mínima de usuario
  (`email`, `username`, `verified`, `mfaEnabled`, rol). No debe listar todos los
  usuarios del sistema.
- **Settings:** decidir si el app admin puede editar TTL/MFA de su app o solo
  el owner. Recomendación: owner edita todo; app admin solo branding y lectura
  del resto en fase 1.
- **Nunca exponer secretos.** `mfaSecret`, `mfaRecoveryCodes`, hashes, claves
  JWT, `SMTP_PASS`, `MFA_SECRET_ENCRYPTION_KEY` no salen por la API.
- **Panel como SPA:** añadir su origen a `CORS_ORIGINS`. Usar access token en
  memoria + refresh; si se usan cookies, hace falta CSRF.
- **Auditar toda mutación de management** (ver §7.3), incluyendo actor, target,
  app y resultado. Hoy solo se auditan auth y grants.
- **Confirmaciones destructivas:** borrar usuario, desactivar app, resetear MFA
  y revocar sesiones deben requerir confirmación explícita en la UI y quedar en
  auditoría.
- **Rate limiting del panel:** los endpoints de management también deben tener
  límites; hoy solo auth tiene limitadores por ruta.

---

## 6. Clasificación de configuración (qué puede editar el panel)

| Categoría               | Ejemplos                                                                                                                                                                                                                                                                        | ¿Editable en caliente?                                | Dónde vive            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------- |
| Arranque obligatorio    | `MONGO_URI`, `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_KEY_ID`, `JWT_RETIRED_PUBLIC_KEYS`, `CORS_ORIGINS`, `TRUST_PROXY`, `TEMPLATES_PATH`, `MFA_SECRET_ENCRYPTION_KEY`                                                                                                         | No (requiere redeploy)                                | Entorno               |
| Secretos de integración | `SMTP_*`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OWNER_CHAT_ID`, `MAIL_FROM`                                                                                                                                                                                                           | No desde el panel (solo test de conexión)             | Entorno               |
| Políticas globales      | `MAX_LOGIN_ATTEMPTS`, `LOCKOUT_DURATION_MS`, `MAX_SESSIONS_PER_USER`, `JWT_EXPIRATION`, `JWT_REFRESH_EXPIRATION`, `CODE_LENGTH`, `CODE_EXPIRATION_MS`, `MFA_CHALLENGE_EXPIRATION`, `INVITATION_LINK_EXPIRATION_MS`, `PASSWORD_RESET_LINK_EXPIRATION_MS`, `AUDIT_RETENTION_DAYS` | Parcial: requiere leerlas en cada request o reiniciar | Entorno + settings    |
| Políticas por app       | TTLs, MFA, sesiones, verificación, TTL invitación, branding                                                                                                                                                                                                                     | Sí, tras refactor §4.4                                | `ApplicationSettings` |
| Rate limits             | `RATE_LIMIT_*`                                                                                                                                                                                                                                                                  | No en fase 1; requieren limitadores dinámicos         | Entorno               |

Regla práctica: **si el valor se usa al construir un objeto singleton, es
boot-time**. Si se puede pasar como parámetro por request, es editable.

---

## 7. Riesgos y deuda detectada que afectan al panel

### 7.1 `PATCH /users/:id` es un backdoor

El controlador elimina `role`, `_id`, `id` y `__v`, pero reenvía **todo lo
demás** al servicio. Eso permite escribir `mfaEnabled`, `mfaSecret`,
`loginAttempts`, `lockoutUntil`, `verified` o `password` sin validación ni
auditoría. En particular, `{ "mfaEnabled": false }` desactiva el segundo factor
dejando el secreto en la base de datos. El panel no debe usar este atajo:
conviene una **allowlist** de campos de perfil (`username`, `email`, `password`,
`verified`, `telegramChatId`) y endpoints explícitos para seguridad.

### 7.2 Cambiar `email` no verifica

`PATCH /users/:id` permite cambiar el email sin confirmación. Si el panel lo
ofrece, debe pasar por un flujo de verificación o al menos advertirlo.

### 7.3 Cobertura de auditoría incompleta

Hoy se auditan login, refresh, logout, revocación de sesiones, bloqueo y
grants. Faltan los eventos que el panel va a provocar:

- `application.created`, `application.updated`, `application.activated`,
  `application.deactivated`
- `user.created`, `user.updated`, `user.deleted`, `user.unlocked`,
  `user.mfa_reset`, `user.verified`
- `settings.updated`
- `invitation.created`, `invitation.revoked`, `invitation.resent`
- `session.revoked_by_admin`

Sin esto, el panel no puede responder "quién desactivó esta app" o "quién
reseteó el MFA de este usuario".

### 7.4 Desactivar una app no corta access tokens

`ApplicationTokenService` comprueba `active` al emitir y al refrescar, pero
`AuthenticationMiddleware` solo verifica firma y blacklist. Un access token de
una app desactivada sigue siendo válido hasta su `exp`. Opciones:

- Aceptarlo y documentarlo (el refresh morirá y la sesión acabará).
- Añadir comprobación de `active` por request (una lectura más; ya se hace una
  lectura de grant en rutas de app, pero no en todas).
- Blacklistear por audiencia al desactivar (requiere índice/consulta nueva).

Decisión pendiente para el diseño.

### 7.5 Sin paginación ni búsqueda

`GET /users`, `GET /applications`, `GET /.../grants` y `GET /audit-events` no
tienen `page`, `limit`, `q` ni orden. En cuanto el hogar tenga unos cientos de
usuarios, el panel se vuelve lento. `audit-events` está limitado a 200, así que
la paginación no es opcional.

### 7.6 Grants sin datos de usuario

`GET /.../grants` devuelve `userId` como ObjectId. El panel necesita el email.
Esto obliga a un endpoint `members` enriquecido o a un `populate`.

### 7.7 Sesiones no visibles para administración

Solo el propio usuario puede listar/revocar sus sesiones. No hay vista por
usuario ni por app, ni un "cerrar todas las sesiones de esta app".

---

## 8. Plan propuesto por fases

### Fase 0 — Panel de solo lectura (sin cambios de API)

Reutilizable hoy:

- Login owner (`/auth/login` sin `application`).
- Login app admin (`/auth/login` con `application`) **solo si** se resuelve el
  bootstrap con §3.1.
- `GET /auth/me`, `GET /auth/sessions`.
- `GET /users`, `GET /users/:id`.
- `GET /applications`, `GET /applications/:id`.
- `GET /.../grants` (con `userId` sin resolver).
- `GET /audit-events` (hasta 200).
- `GET /health`, `/ready`, `/.well-known/jwks.json`.

Sirve para validar navegación, tablas y permisos, pero no para operar.

### Fase 1 — Management mínimo viable (P0)

1. `GET /auth/context` (bootstrap del panel).
2. `PATCH /applications/:id` (`name`, `active`) + acceso AA a
   `GET /applications/:id`.
3. `GET /applications/:id/members` enriquecido + `POST .../members` por email +
   `PATCH .../members/:userId`.
4. `POST /users/:id/unlock`, `POST /users/:id/mfa/reset`,
   `POST /users/:id/verify`, `GET/DELETE /users/:id/sessions`.
5. Allowlist en `PATCH /users/:id` y exponer estado de seguridad al owner.
6. Invitaciones: `GET`, `DELETE`, `POST .../resend`.
7. Paginación y búsqueda en users, applications, members y audit.
8. Eventos de auditoría de management.
9. `GET /admin/overview`.

### Fase 2 — Configuración dinámica (P1)

1. Modelo `ApplicationSettings` + `SettingsService` con caché e invalidación.
2. `GET/PATCH /applications/:id/settings`.
3. `GET/PATCH /settings` global con defaults desde entorno.
4. Aplicar TTLs por app en `JwtService`/`SessionService`.
5. Aplicar `mfaPolicy` (`disabled`/`optional`/`required`).
6. `maxSessionsPerUser` y `requireVerifiedEmail` por app.
7. TTL de invitación por app.
8. Branding por app en emails/otpauth (si se decide).

### Fase 3 — Operación avanzada (P2)

1. Rate limits dinámicos por app y ruta (requiere limitadores por request).
2. Lockout por app (requiere mover la verificación de credenciales).
3. `GET /applications/:id/overview` y sesiones por app.
4. Export CSV de auditoría y catálogo de eventos.
5. Gestión de holders (listar/limpiar) y reenvío de verificación.
6. Test de SMTP/Telegram desde settings (sin exponer secretos).
7. Rotación de claves JWT asistida (runbook + estado, no edición de claves).

---

## 9. Lo que el panel **no** debería hacer

- Editar `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_KEY_ID`,
  `JWT_RETIRED_PUBLIC_KEYS` o `MFA_SECRET_ENCRYPTION_KEY`.
- Editar `MONGO_URI`, `CORS_ORIGINS`, `TRUST_PROXY` o `TEMPLATES_PATH`.
- Guardar o mostrar `SMTP_PASS`, `TELEGRAM_BOT_TOKEN` o secretos MFA.
- Cambiar `slug`/`audience` de una app en caliente sin un plan de migración.
- Borrar físicamente una app con grants o sesiones sin confirmación y auditoría.
- Convertir a un usuario en owner o transferir el owner (hoy es un runbook).
- Permitir que un app admin lea usuarios fuera de su app.

---

## 10. Decisiones pendientes antes de diseñar el panel

1. **Alcance del app admin:** ¿puede editar settings de su app (TTL, MFA) o
   solo el owner? ¿Puede ver emails de sus miembros?
2. **Ciclo de vida:** ¿`DELETE /applications/:id` archiva o borra? ¿Se permite
   borrar con grants?
3. **Compatibilidad de paginación:** ¿rompemos `GET /users` y
   `GET /applications` devolviendo `{ items, total }`, o mantenemos el array y
   añadimos cabeceras (`X-Total-Count`, `X-Next-Cursor`)?
4. **Lockout:** ¿se queda global o se invierte esfuerzo en hacerlo por app?
5. **MFA por app:** ¿qué significa `required`? ¿Bloquea el login con un challenge
   de enrolamiento o exige enrolar antes de emitir tokens?
6. **Branding:** ¿los emails son globales o por app? Afecta a plantillas y a
   `AuthMailer`.
7. **Hosting del panel:** ¿SPA separada en otro origen (CORS + cookies/CSRF) o
   servida por el mismo backend? Cambia la estrategia de sesión.
8. **Settings globales:** ¿Mongo con seed desde entorno o solo lectura de
   entorno en fase 1? Si es Mongo, hay que decidir la precedencia
   `DB > env > default` y el cacheo.
