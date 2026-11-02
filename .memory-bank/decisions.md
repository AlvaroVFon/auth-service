# Architecture Decision Records

## ADR-001: Account Lockout Strategy

- **Date:** 2026-06-14
- **Context:** Need to protect against brute-force attacks on the login endpoint. Options include IP-based blocking, CAPTCHA, account lockout, or a combination.
- **Decision:** Implement account-based lockout (not IP-based). After `MAX_LOGIN_ATTEMPTS` consecutive failed logins, the account is locked for `LOCKOUT_DURATION_MS`. Both values are configurable via environment variables. Atomic Mongoose updates (`$inc`, `$set`) are used to prevent race conditions. The same thresholds guard repeated invalid MFA codes, tracked in dedicated counters (`mfaFailedAttempts` / `mfaLockoutUntil`).
- **Consequences:**
  - Legitimate users may be locked out if an attacker knows their email.
  - No IP tracking means distributed attacks are not mitigated (rate limiting handles that separately).
  - Lockout fields (`loginAttempts`, `lockoutUntil`) are stripped from JSON responses for security.
  - Password reset does not clear the lockout counter (can be added later).

## ADR-002: Per-Route Rate Limiting Strategy

- **Date:** 2026-06-14
- **Context:** The global rate limiter (100 req/15min) is too permissive for sensitive auth endpoints. Brute-force attacks on login, mass account creation via signup, and email bombing via forgot-password need stricter, per-endpoint limits.
- **Decision:** Route-level limiters for `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/refresh` and `/auth/mfa/verify`. Each limiter is an independent `express-rate-limit` instance created via a factory function, configured through environment variables, and injected via DI (composition root → AuthModule → AuthRouter). The global limiter remains as a safety net for all routes and skips the probes.
- **Consequences:**
  - Per-route limits are IP-based (in-memory store), complementing the account-based lockout (ADR-001).
  - In-memory store means rate limits reset on server restart and are not shared across instances (acceptable for single-instance deployment; see ROADMAP).
  - The global limiter still applies — a request must pass both the per-route and global limiters.
  - New sensitive endpoints need an explicit limiter; the defaults are deliberately strict.

## ADR-003: Un hogar único con aplicaciones y permisos por usuario

- **Date:** 2026-11-01
- **Context:** El servicio nació con un módulo `tenants` pensado como app cliente autenticada por `tenantSecret`. Ese modelo no representa el uso real (un hogar con varias apps) y dejó código muerto: el token de tenant no lo aceptaba ningún middleware y el secreto se guardaba en claro.
- **Decision:** Eliminar `tenants` y modelar un hogar único con dos entidades: `Application` (nombre, slug y audience únicos, activa) y `Grant` (par usuario-aplicación único con rol `viewer`, `editor` o `admin`). Un usuario puede tener roles distintos en cada app y no tener acceso a otras.
- **Consequences:**
  - No existe multi-hogar ni aislamiento por base de datos.
  - La autorización se resuelve por permiso de aplicación, no por un rol global.
  - La emisión de tokens con audiencia, el bootstrap del owner y los endpoints de administración se entregaron en las issues #39–#42; el estado final está en README y ROADMAP.
  - La colección `tenants` y sus `secret` en claro no se borran al eliminar el código: requiere `db.tenants.drop()` en cada entorno (ver `docs/implementations/2026-11-01-applications-and-permissions.md`).

## ADR-004: Owner único y autorización por aplicación

- **Date:** 2026-11-02
- **Context:** El rol global `ADMIN` no era una fuente de autorización sostenible: nadie podía obtenerlo sin tocar la base de datos, y no distinguía entre administrar el hogar y administrar una app concreta.
- **Decision:** Añadir el rol global `owner` (único, garantizado por un índice único parcial) y provisionarlo de forma idempotente desde `OWNER_EMAIL`/`OWNER_PASSWORD` en el arranque o con `pnpm bootstrap:owner`. `/users` y el catálogo de aplicaciones pasan a ser owner-only. La gestión de permisos e invitaciones de una app se autoriza contra el `Grant` de la base de datos: owner siempre, admin de esa app para el resto. `ADMIN`/`USER` se conservan en el enum solo por compatibilidad de datos y tokens; `ADMIN` ya no autoriza.
- **Consequences:**
  - Cambio incompatible: los `ADMIN` existentes pierden acceso a `/users` hasta convertirse en owner o admin de app.
  - Un único owner; cambiar su email o crear otro requiere intervención manual.
  - La contraseña configurada no rota la del owner existente: se usa el flujo de reset.
  - La revocación de permisos es inmediata porque cada petición consulta el grant, a costa de una lectura adicional.
  - Cambiar el email configurado cuando ya existe un owner aborta el arranque en lugar de crear un segundo owner.

## ADR-005: RS256 con JWKS y rotación por claves retiradas

- **Date:** 2026-11-02
- **Context:** Los consumidores (apps del hogar) necesitan verificar tokens sin compartir un secreto simétrico, y rotar la clave no puede invalidar sesiones vivas.
- **Decision:** Firmar con RS256 usando un `JwtKeyring` con clave activa y claves retiradas; publicar las públicas en `GET /.well-known/jwks.json`. `JWT_PUBLIC_KEY` se deriva de la privada y `JWT_KEY_ID` cae al thumbprint RFC 7638. `JWT_RETIRED_PUBLIC_KEYS` acepta las claves antiguas durante la rotación. `JWT_SECRET` queda solo como puente para tokens HS256 heredados sin audiencia.
- **Consequences:**
  - Las claves privadas son obligatorias en producción; las efímeras (`JWT_ALLOW_EPHEMERAL_KEYS`) se rechazan con `NODE_ENV=production` porque difieren por proceso.
  - La rotación exige desplegar la nueva clave, esperar el TTL máximo de refresh y retirar las entradas antiguas.
  - El JWKS es público y cacheable: nunca contiene material privado.
  - Ver `docs/implementations/2026-11-02-rs256-jwks.md` para el runbook completo.

## ADR-006: Rotación de refresh tokens, blacklist y sesiones por dispositivo

- **Date:** 2026-11-02
- **Context:** Un refresh token reutilizable permite secuestros permanentes y el logout no podía invalidar access tokens ya emitidos.
- **Decision:** Cada refresh token se persiste con `jti`, IP, user-agent, aplicación y última actividad; `POST /auth/refresh` lo rota (`replacedByJti`) y rechaza reutilizaciones. El logout añade además el `jti` del access token a `BlacklistedToken`, con TTL hasta su expiración. La revocación de sesión (`DELETE /auth/sessions*`) solo invalida los refresh tokens: el access token ya emitido sigue siendo válido hasta que caduca. Cada login abre una sesión independiente y `MAX_SESSIONS_PER_USER` revoca las más antiguas.
- **Consequences:**
  - El cliente debe estar preparado para recibir un refresh token nuevo en cada refresh.
  - La blacklist añade una lectura por petición autenticada; el TTL la limpia sola.
  - Reutilizar un refresh token revocado no devuelve tokens nuevos: hay que volver a iniciar sesión.
  - Revocar una sesión no corta el access token en vuelo; para eso está el logout, o esperar a `JWT_EXPIRATION`.
  - Ver `docs/implementations/2026-11-02-public-refresh.md` y `.../device-sessions.md`.

## ADR-007: Auditoría persistente con retención por TTL

- **Date:** 2026-11-02
- **Context:** El servicio ya registraba logs de winston, que no sirven para que el owner consulte quién hizo qué y cuándo.
- **Decision:** Registrar eventos de autenticación y permisos en la colección `AuditEvent` con identificadores y metadatos de la petición (IP, user-agent), nunca secretos, tokens, códigos ni enlaces. La retención se controla con `AUDIT_RETENTION_DAYS` mediante índice TTL. Solo el owner consulta `GET /audit-events`.
- **Consequences:**
  - Escribir auditoría es parte del flujo de login, refresh, logout, bloqueo, revocación y cambios de grant; un fallo de escritura no debe tumbar la operación principal.
  - La retención es fija por entorno y no hay exportación histórica.
  - Ver `docs/implementations/2026-11-02-auth-audit-log.md`.

## ADR-008: Enlaces compartibles de un solo uso para invitaciones y resets

- **Date:** 2026-11-02
- **Context:** Las invitaciones y los resets dependían de SMTP, lo que bloquea el alta cuando el correo no está configurado o falla.
- **Decision:** La API genera un enlace con token de un solo uso, lo guarda hasheado en `Link` con expiración (`INVITATION_LINK_EXPIRATION_MS`, `PASSWORD_RESET_LINK_EXPIRATION_MS`) y devuelve la URL para que el owner la comparta por cualquier canal. La entrega por Telegram es opcional y best-effort: un fallo de notificación nunca rompe la creación del enlace.
- **Consequences:**
  - El token viaja por canales externos; el servidor solo guarda su hash.
  - Los enlaces caducan y se consumen una vez; repetir la aceptación falla.
  - SMTP sigue existiendo para verificación y forgot-password, pero ya no es imprescindible para dar acceso a una app.
  - Ver `docs/implementations/2026-11-02-invitations-and-shareable-reset.md`.

## ADR-009: MFA TOTP con secretos cifrados y códigos de recuperación

- **Date:** 2026-11-02
- **Context:** El servicio necesitaba un segundo factor sin depender de un proveedor externo ni de SMS.
- **Decision:** TOTP estándar (compatible con cualquier app de autenticación). El secreto se cifra en reposo con AES-256-GCM usando `MFA_SECRET_ENCRYPTION_KEY` (base64 de 32 bytes); sin esa clave se mantiene el formato plano heredado. El login devuelve un challenge JWT de corta vida con audiencia reservada (`auth-service:mfa`) y los códigos de recuperación se guardan solo como hashes SHA-256 y se consumen de forma atómica.
- **Consequences:**
  - Perder la app y los códigos deja la cuenta bloqueada hasta intervención del owner.
  - Cambiar o perder `MFA_SECRET_ENCRYPTION_KEY` inutiliza los secretos existentes.
  - El challenge no sirve como Bearer token ni lo aceptan consumidores que validan la audiencia de la app.
  - Ver `docs/implementations/2026-11-02-mfa-totp.md`.

## ADR-010: Composition root única para el cableado manual

- **Date:** 2026-11-02
- **Context:** `bootstrap.ts` acumulaba la construcción de servicios, la carga de entorno, la conexión a Mongo y el arranque del servidor, lo que dificultaba probar el cableado y añadir módulos.
- **Decision:** `createApplicationComposition()` en `src/config/application.composition.ts` construye servicios, módulos y adaptadores y expone `initialize(app)`; `bootstrap.ts` se queda con el ciclo de vida (cargar `.env`, conectar, provisionar owner, escuchar) y admite overrides para tests.
- **Consequences:**
  - Todo servicio nuevo se registra en la composición, no en el entry point.
  - Los tests de bootstrap pueden inyectar logger, base de datos, JWT y mailer sin arrancar procesos.
  - Ver `docs/implementations/2026-10-04-application-composition.md`.
