# Architecture Decision Records

## ADR-001: Account Lockout Strategy

- **Date:** 2026-06-14
- **Context:** Need to protect against brute-force attacks on the login endpoint. Options include IP-based blocking, CAPTCHA, account lockout, or a combination.
- **Decision:** Implement account-based lockout (not IP-based). After `MAX_LOGIN_ATTEMPTS` consecutive failed logins, the account is locked for `LOCKOUT_DURATION_MS`. Both values are configurable via environment variables. Atomic Mongoose updates (`$inc`, `$set`) are used to prevent race conditions.
- **Consequences:**
  - Legitimate users may be locked out if an attacker knows their email.
  - No IP tracking means distributed attacks are not mitigated (rate limiting handles that separately).
  - Lockout fields (`loginAttempts`, `lockoutUntil`) are stripped from JSON responses for security.
  - Password reset does not clear the lockout counter (can be added later).

## ADR-002: Per-Route Rate Limiting Strategy

- **Date:** 2026-06-14
- **Context:** The global rate limiter (100 req/15min) is too permissive for sensitive auth endpoints. Brute-force attacks on login, mass account creation via signup, and email bombing via forgot-password need stricter, per-endpoint limits.
- **Decision:** Add route-level rate limiters for `/auth/login` (5/15min), `/auth/signup` (3/1hr), and `/auth/forgot-password` (3/1hr). Each limiter is an independent `express-rate-limit` instance created via a factory function, configured through environment variables, and injected via DI (bootstrap → AuthModule → AuthRouter). The global limiter remains as a safety net for all routes.
- **Consequences:**
  - Per-route limits are IP-based (in-memory store), complementing the account-based lockout (ADR-001).
  - In-memory store means rate limits reset on server restart and are not shared across instances (acceptable for single-instance deployment).
  - The global limiter still applies — a request must pass both the per-route and global limiters.
  - Only three endpoints are rate-limited in this phase; others can be added incrementally.

## ADR-004: Owner único y autorización por aplicación

- **Date:** 2026-11-02
- **Context:** El rol global `ADMIN` no era una fuente de autorización sostenible: nadie podía obtenerlo sin tocar la base de datos, y no distinguía entre administrar el hogar y administrar una app concreta.
- **Decision:** Añadir el rol global `owner` (único, garantizado por un índice único parcial) y provisionarlo de forma idempotente desde `OWNER_EMAIL`/`OWNER_PASSWORD` en el arranque o con `pnpm bootstrap:owner`. `/users` y el catálogo de aplicaciones pasan a ser owner-only. La gestión de permisos de una app se autoriza contra el `Grant` de la base de datos: owner siempre, admin de esa app para el resto. `ADMIN`/`USER` se conservan en el enum solo por compatibilidad de datos y tokens; `ADMIN` ya no autoriza.
- **Consequences:**
  - Cambio incompatible: los `ADMIN` existentes pierden acceso a `/users` hasta convertirse en owner o admin de app.
  - Un único owner; cambiar su email o crear otro requiere intervención manual.
  - La contraseña configurada no rota la del owner existente: se usa el flujo de reset.
  - La revocación de permisos es inmediata porque cada petición consulta el grant, a costa de una lectura adicional.
  - Cambiar el email configurado cuando ya existe un owner aborta el arranque en lugar de crear un segundo owner.

## ADR-003: Un hogar único con aplicaciones y permisos por usuario

- **Date:** 2026-11-01
- **Context:** El servicio nació con un módulo `tenants` pensado como app cliente autenticada por `tenantSecret`. Ese modelo no representa el uso real (un hogar con varias apps) y dejó código muerto: el token de tenant no lo aceptaba ningún middleware y el secreto se guardaba en claro.
- **Decision:** Eliminar `tenants` y modelar un hogar único con dos entidades: `Application` (nombre, slug y audience únicos, activa) y `Grant` (par usuario-aplicación único con rol `viewer`, `editor` o `admin`). Un usuario puede tener roles distintos en cada app y no tener acceso a otras. El rol global `ADMIN`/`USER` no es la fuente de autorización a largo plazo; su sustitución se aborda en la issue #41.
- **Consequences:**
  - No existe multi-hogar ni aislamiento por base de datos.
  - La autorización se resuelve por permiso de aplicación, no por un rol global.
  - Los endpoints, la emisión de tokens con audiencia y el bootstrap del owner quedan en issues posteriores (#39–#42).
  - La colección `tenants` y sus `secret` en claro no se borran al eliminar el código: requiere `db.tenants.drop()` en cada entorno (ver `docs/implementations/2026-11-01-applications-and-permissions.md`).
