# Roadmap: Auth-Service Evolution

Este documento describe el estado real del servicio de autenticación y lo que queda
pendiente. El hogar es único; lo que varía es el acceso de cada usuario a cada
aplicación.

---

## Fase 1: Sesiones y Gestión de Tokens (Robustez) — 100% Completada

Objetivo: sesiones largas y seguras sin comprometer la seguridad.

- [x] **Refresh tokens:** colección `RefreshToken`, rotación de un solo uso vía
      `replacedByJti`, `POST /auth/refresh` que solo necesita el refresh token.
- [x] **Logout y revocación:** `POST /auth/logout` revoca las sesiones del llamante para
      la aplicación del token (todas si el token no tiene audiencia).
- [x] **Blacklist de access tokens:** `BlacklistedToken` con TTL; los tokens revocados
      dejan de aceptarse antes de expirar.
- [x] **Información de sesión:** cada refresh token guarda IP, user-agent, aplicación y
      última actividad; `GET /auth/sessions`, `DELETE /auth/sessions/:sessionId` y
      `DELETE /auth/sessions`; `MAX_SESSIONS_PER_USER` revoca las sesiones más antiguas.
- [x] **Perfil e introspección:** `GET /auth/me` y `POST /auth/introspect` acotados al
      propio llamante y a su aplicación.

## Fase 2: Recuperación y Experiencia de Usuario — 100% Completada

- [x] **Flujo forgot password:** `POST /auth/forgot-password` (código por email, sin
      revelar si la cuenta existe) y `POST /auth/reset-password`.
- [x] **Verificación de email:** flujo holder -> user con `POST /auth/verify`.
- [x] **Enlaces compartibles de un solo uso:** invitaciones y resets generados por API,
      hasheados en reposo, con expiración configurable, sin depender de SMTP.
- [x] **Plantillas:** handlebars para verificación y reset (`signup_verification`,
      `reset_password`, `welcome`).

## Fase 3: Blindaje de Seguridad (Hardening) — 100% Completada

- [x] **Rate limiting:** límite global fijo de 100 req / 15 min y límites por ruta
      (`login`, `signup`, `forgot-password`, `refresh`, `mfa/verify`) configurables por
      entorno.
- [x] **Bloqueo de cuentas:** `loginAttempts` / `lockoutUntil` con actualizaciones
      atómicas, aplicado también a los códigos MFA inválidos.
- [x] **Auditoría:** `AuditEvent` con eventos de autenticación y permisos, TTL por
      `AUDIT_RETENTION_DAYS` y consulta owner en `GET /audit-events`; nunca guarda
      secretos, tokens ni enlaces.
- [x] **Endurecimiento HTTP:** `helmet`, allowlist de CORS validada al arranque,
      `TRUST_PROXY` con validación estricta, validación de body y apagado ordenado ante
      `SIGTERM`/`SIGINT`.
- [x] **MFA TOTP:** enrolamiento, activación, verificación con challenge de corta vida,
      códigos de recuperación de un solo uso y secretos cifrados con AES-256-GCM.

## Fase 4: Autenticación Social (OAuth2) — 0% Completada

- [ ] **Login con Google:** no implementado.
- [ ] **Login con GitHub:** no implementado.

## Fase 5: Aplicaciones del Hogar y Permisos por App — 100% del alcance entregado

- [x] **Retirada del modelo de tenants:** schema, login por `tenantSecret`, servicio y
      token eliminados.
- [x] **Catálogo de aplicaciones:** `Application` con `name`, `slug`, `audience` y
      `active`, administrado por el owner.
- [x] **Permisos por par usuario-aplicación:** `Grant` con rol `viewer`, `editor` o
      `admin`; owner global y admin de app como autorizadores.
- [x] **Bootstrap del owner:** idempotente desde `OWNER_EMAIL`/`OWNER_PASSWORD` en el
      arranque o con `pnpm bootstrap:owner`.
- [x] **Tokens con audiencia por app:** RS256 con JWKS y claves retiradas para rotar;
      login contra una app concreta con el rol del grant.
- [ ] **Ciclo de vida de aplicaciones:** no hay `PATCH`/`DELETE /applications`; crear,
      activar o desactivar exige tocar la base de datos.

---

## Cobertura de Tests

- **Total:** 708 tests en verde con `node --test` y `tsx`.
  - 226 unitarios (`pnpm test:unit`, sin MongoDB): configuración, JWT/keyring,
    criptografía, mailer, plantillas, códigos, validadores y composición.
  - 304 de integración (`pnpm test:integration`, con MongoDB): servicios de usuarios,
    auth, holders, applications, grants, links, audit y tokens.
  - 178 e2e (`pnpm test:e2e`, con MongoDB): flujos HTTP completos de signup, login,
    refresh, logout, verificación, reset, sesiones, MFA, invitaciones, auditoría,
    owner bootstrap, CORS y cascada de borrado.
- Base de datos aislada por proceso (`auth_db_test_${pid}`), sembrada y vaciada por
  `test/setup.db.ts`; `pnpm test:coverage` genera el informe con la cobertura nativa de
  Node.

---

## Próximos Pasos Inmediatos

El backlog de implementación está cerrado: no quedan issues de funcionalidad abiertos.
Los siguientes candidatos, por orden de valor:

1. **OAuth2** (Fase 4): Google y GitHub como proveedores adicionales.
2. **Ciclo de vida de aplicaciones:** `PATCH`/`DELETE /applications` y activación/
   desactivación sin tocar MongoDB.
3. **Escalado horizontal:** stores compartidos para rate limiting y blacklist de access
   tokens (hoy en memoria por instancia).
4. **Operación:** métricas y trazas además de los logs de winston.

---

## Consideraciones Técnicas

- **Stack:** Express 5 + Mongoose (MongoDB) + TypeScript (ESM via `tsx`).
- **Tokens:** JWT RS256 con `jti`; access 1h y refresh 24h por defecto
  (`JWT_EXPIRATION`, `JWT_REFRESH_EXPIRATION`), rotación completa. JWKS en
  `/.well-known/jwks.json` y `JWT_RETIRED_PUBLIC_KEYS` para rotar sin cortar sesiones.
  `JWT_SECRET` solo verifica tokens HS256 heredados sin audiencia.
- **Rate limiting:** `express-rate-limit` con store en memoria; los límites se reinician
  al reiniciar y no se comparten entre instancias.
- **Aplicaciones del hogar:** `Application` (slug + audience) y `Grant` por par
  usuario-aplicación con rol `viewer`/`editor`/`admin`. Owner único para el catálogo y
  `/users`; cada admin administra solo su aplicación. Sin multi-hogar.
- **Configuración:** todas las variables, sus valores por defecto y su obligatoriedad en
  producción están en el README (`## Environment variables`).
