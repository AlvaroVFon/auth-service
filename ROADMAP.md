# Roadmap: Auth-Service Evolution

Este documento detalla el plan para fortalecer el servicio de autenticación actual, transformándolo en una solución robusta y profesional antes de escalar a una arquitectura multi-tenant.

---

## Fase 1: Sesiones y Gestión de Tokens (Robustez) - 80% Completada

El objetivo es permitir sesiones largas y seguras sin comprometer la seguridad.

- [x] **Implementación de Refresh Tokens:**
  - [x] Crear una colección `RefreshToken` para persistir tokens de larga duración.
  - [x] Implementar rotación de tokens (un uso por token) para prevenir ataques de reutilización.
  - [x] Endpoint `POST /auth/refresh` para generar nuevos Access Tokens (lógica implementada en servicio, pendiente exponer en router).
- [ ] **Mecanismo de Logout / Revocación:**
  - [x] Endpoint `POST /auth/logout` que invalide el refresh token actual (lógica implementada en servicio, pendiente exponer en router).
  - [ ] Implementar una "Blacklist" para invalidar Access Tokens si es necesario.
- [ ] **Información de Sesión:**
  - [ ] Registrar IP y User-Agent en cada login para control de dispositivos.

## Fase 2: Recuperación y Experiencia de Usuario - 30% Completada

Completar los flujos esenciales de autoservicio de cuenta.

- [ ] **Flujo Completo de "Forgot Password":**
  - [ ] Endpoint público `POST /auth/forgot-password` (envío de código por email).
  - [ ] Agregar `sendPasswordResetEmail()` al `MailerInterface` y adaptadores.
  - [ ] Crear template `password_reset.hbs` en `src/mail/templates/`.
  - [ ] Endpoint `POST /auth/reset-password` que valide el código y cambie la contraseña (actual requiere auth, necesita versión pública con código).
- [x] **Verificación de Email (Hardening):**
  - [x] Asegurar que el flujo de `verify` sea consistente y obligatorio para activar la cuenta.

## Fase 3: Blindaje de Seguridad (Hardening) - 0% Completada

Proteger el servicio contra abusos y ataques automatizados.

- [ ] **Rate Limiting:**
  - [ ] Implementar límites de peticiones por IP (`express-rate-limit`).
  - [ ] Aplicar políticas estrictas en `/auth/login`, `/auth/signup` y recuperación de contraseña.
- [ ] **Bloqueo de Cuentas (Account Lockout):**
  - [ ] Implementar contador de intentos fallidos en `User` schema.
  - [ ] Bloquear temporalmente cuentas tras X intentos fallidos.

## Fase 4: Autenticación Social (OAuth2) - 0% Completada

Reducir la fricción para nuevos usuarios.

- [ ] **Integración con Proveedores:**
  - [ ] Implementar "Login with Google".
  - [ ] Implementar "Login with GitHub".

## Fase 5: Transición a Multi-Tenancy - 0% Completada

Una vez el servicio sea robusto, escalar hacia múltiples proyectos.

- [ ] **Cimientos de Tenants:**
  - [ ] Crear el módulo de `Tenants` para gestionar proyectos.
- [ ] **Aislamiento Físico (Database-per-tenant):**
  - [ ] Implementar el `ConnectionManager` para gestionar múltiples dbs de Mongoose dinámicamente.
- [ ] **Seguridad Multi-tenant:**
  - [ ] Incluir y validar `tenantId` en los JWT y filtrado de datos.

---

## Próximos Pasos Inmediatos

1. Exponer endpoints `POST /auth/refresh` y `POST /auth/logout` en `auth.router.ts`.
2. Implementar flujo completo de "Forgot Password" (endpoint, template, mailer method).
3. Agregar tracking de IP/User-Agent en login (Fase 1).
4. Implementar Rate Limiting (Fase 3).
5. Implementar Account Lockout (Fase 3).

---

## Consideraciones Técnicas

- **Estrategia de Datos:** Mantener el uso de Mongoose, moviéndose hacia una arquitectura de modelos dinámicos en la Fase 5.
- **Prioridad:** Primero robustez y funcionalidad core, luego escalabilidad multi-proyecto.
- **Estado Actual:** Core user CRUD y auth scaffolding en lugar, refresh tokens lógica completa pero endpoints faltantes, verificación de email funcional.
