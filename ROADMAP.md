# Roadmap: Auth-Service Evolution

Este documento detalla el plan para fortalecer el servicio de autenticación actual, transformándolo en una solución robusta y profesional antes de escalar a una arquitectura multi-tenant.

---

## Fase 1: Sesiones y Gestión de Tokens (Robustez) — ~60% Completada

El objetivo es permitir sesiones largas y seguras sin comprometer la seguridad.

- [x] **Implementación de Refresh Tokens:**
  - [x] Colección `RefreshToken` para persistir tokens de larga duración.
  - [x] Rotación de tokens (un uso por token, reemplazo vía `replacedByJti`).
  - [x] Endpoint `POST /auth/refresh` expuesto y funcional (requiere auth).
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

## Fase 5: Transición a Multi-Tenancy — ~20% Completada

- [x] **Cimientos de Tenants:**
  - [x] Módulo `Tenants` con schema (`name`, `active`, `description`, `secret`).
  - [x] Servicio con `findById()`.
  - [x] Autenticación tenant (`POST /auth/tenant/login` + JWT + middleware).
- [ ] **CRUD completo de Tenants:** No implementado (create, update, delete, list).
- [ ] **Aislamiento Físico (Database-per-tenant):** `ConnectionManager` no implementado.
- [ ] **Seguridad Multi-tenant:** `tenantId` ausente en JWT, User y queries.

---

## Cobertura de Tests

- **Unitarios:** Auth service, auth-tenant service, refresh tokens, JWT, crypto, users, holders, codes, tenants, config, env.
- **E2E:** Login, signup, logout, refresh, verify email, forgot-password, reset-password, tenant-login, CRUD users.
- Los tests usan `node --test` con `tsx` y base de datos aislada por proceso (`auth_db_test_${pid}`).

---

## Próximos Pasos Inmediatos

1. Añadir políticas de rate limiting estrictas en `/auth/login`, `/auth/signup`, `/auth/forgot-password`.
2. Implementar Account Lockout (campos en User schema + contador en login).
3. Tracking de IP / User-Agent en login y refresh tokens.
4. Blacklist de Access Tokens.
5. OAuth2 (Google, GitHub).

---

## Consideraciones Técnicas

- **Stack:** Express 5 + Mongoose (MongoDB) + TypeScript (ESM via `tsx`).
- **Tokens:** JWT con `jti` (UUID). Access: 1h. Refresh: configurable (JWT_REFRESH_EXPIRATION). Rotación completa.
- **Rate Limiting:** `express-rate-limit` v8 global. Pendiente granularidad por endpoint.
- **Multi-tenancy:** Base construida (schema + auth), sin aislamiento físico ni `tenantId` en datos.
- **Prioridad:** Primero robustez y funcionalidad core (Fases 1-3), luego OAuth2, luego escalabilidad multi-proyecto.
