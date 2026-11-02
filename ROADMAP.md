# Roadmap: Auth-Service Evolution

Este documento detalla el plan para fortalecer el servicio de autenticación actual, transformándolo en una solución robusta y profesional antes de organizar el acceso por aplicación dentro del hogar.

---

## Fase 1: Sesiones y Gestión de Tokens (Robustez) — ~60% Completada

El objetivo es permitir sesiones largas y seguras sin comprometer la seguridad.

- [x] **Implementación de Refresh Tokens:**
  - [x] Colección `RefreshToken` para persistir tokens de larga duración.
  - [x] Rotación de tokens (un uso por token, reemplazo vía `replacedByJti`).
  - [x] Endpoint `POST /auth/refresh` expuesto y funcional (solo requiere el refresh token).
- [x] **Logout / Revocación:**
  - [x] Endpoint `POST /auth/logout` expuesto y funcional — revoca todos los refresh tokens activos del usuario.
- [ ] **Blacklist de Access Tokens:** No implementada. Dependencia actual en tokens de corta duración (1h).
- [ ] **Información de Sesión:** No se registra IP ni User-Agent en login ni en refresh tokens.

## Fase 2: Recuperación y Experiencia de Usuario — 100% Completada

- [x] **Flujo "Forgot Password":**
  - [x] Endpoint `POST /auth/forgot-password` (envío de código por email).
  - [x] `sendPasswordResetEmail()` en `MailerInterface`.
  - [x] Template `reset_password.hbs`.
  - [x] Endpoint `POST /auth/reset-password` (público, validación por `userId` + `code`).
- [x] **Verificación de Email:**
  - [x] Flujo Holder → User al verificar email.

## Fase 3: Blindaje de Seguridad (Hardening) — ~15% Completada

- [x] **Rate Limiting:**
  - [x] `express-rate-limit` instalado.
  - [x] Middleware global aplicado (100 req / 15 min).
  - [ ] Políticas estrictas diferenciadas por ruta (`/auth/login`, `/auth/signup`, `/auth/forgot-password`).
- [ ] **Bloqueo de Cuentas (Account Lockout):**
  - [ ] Campos `loginAttempts` / `lockoutUntil` en el schema `User`.
  - [ ] Contador de intentos fallidos en `auth.service.ts`.
  - [ ] Bloqueo temporal tras X intentos fallidos consecutivos.

## Fase 4: Autenticación Social (OAuth2) — 0% Completada

- [ ] **Login con Google:** No implementado.
- [ ] **Login con GitHub:** No implementado.

## Fase 5: Aplicaciones del Hogar y Permisos por App — ~30% Completada

El hogar es único; lo que varía es el acceso de cada usuario a cada aplicación.

- [x] **Retirada del modelo de tenants:** schema, login por `tenantSecret`, servicio y token eliminados (#38).
- [x] **Catálogo de aplicaciones:** `Application` con `name`, `slug`, `audience` y `active` (#38).
- [x] **Permisos por par usuario-aplicación:** `Grant` con rol `viewer`, `editor` o `admin` (#38).
- [x] **API de administración:** alta de apps, asignación y revocación de permisos, bootstrap del owner (#41).
- [x] **Tokens con audiencia por app:** RS256 + JWKS (#39) y login contra una app concreta con el rol del grant (#40).

---

## Cobertura de Tests

- **Unitarios:** Auth service, refresh tokens, JWT, crypto, users, holders, codes, applications, grants, config, env.
- **E2E:** Login, signup, logout, refresh, verify email, forgot-password, reset-password, retirada de tenant-login, CRUD users.
- Los tests usan `node --test` con `tsx` y base de datos aislada por proceso (`auth_db_test_${pid}`).

---

## Próximos Pasos Inmediatos

El backlog priorizado vive en GitHub (issues #38–#53). Orden inmediato:

1. Preparar la imagen Docker de producción y entorno (#48).
2. Notificaciones por Telegram (#51), MFA (#52) y auditoría (#53).

---

## Consideraciones Técnicas

- **Stack:** Express 5 + Mongoose (MongoDB) + TypeScript (ESM via `tsx`).
- **Tokens:** JWT con `jti` (UUID). Access: 1h. Refresh: configurable (JWT_REFRESH_EXPIRATION). Rotación completa.
- **Rate Limiting:** `express-rate-limit` v8 global. Pendiente granularidad por endpoint.
- **Aplicaciones del hogar:** `Application` (slug + audience) y `Grant` por par usuario-aplicación con rol `viewer`/`editor`/`admin`. Owner único para administrar el catálogo y los permisos. Sin multi-hogar ni roles globales de autorización.
- **Prioridad:** Primero robustez y funcionalidad core (Fases 1-3), luego tokens por aplicación y OAuth2.
