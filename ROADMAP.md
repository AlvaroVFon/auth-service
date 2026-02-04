# Roadmap: Auth-Service Evolution

Este documento detalla el plan para fortalecer el servicio de autenticación actual, transformándolo en una solución robusta y profesional antes de escalar a una arquitectura multi-tenant.

---

## Fase 1: Sesiones y Gestión de Tokens (Robustez)

El objetivo es permitir sesiones largas y seguras sin comprometer la seguridad.

- [ ] **Implementación de Refresh Tokens:**
  - Crear una colección `RefreshToken` para persistir tokens de larga duración.
  - Implementar rotación de tokens (un uso por token) para prevenir ataques de reutilización.
  - Endpoint `POST /auth/refresh` para generar nuevos Access Tokens.
- [ ] **Mecanismo de Logout / Revocación:**
  - Endpoint `POST /auth/logout` que invalide el refresh token actual.
  - Implementar una "Blacklist" para invalidar Access Tokens si es necesario.
- [ ] **Información de Sesión:**
  - Registrar IP y User-Agent en cada login para control de dispositivos.

## Fase 2: Recuperación y Experiencia de Usuario

Completar los flujos esenciales de autoservicio de cuenta.

- [ ] **Flujo Completo de "Forgot Password":**
  - Endpoint público `POST /auth/forgot-password` (envío de código por email).
  - Adaptar el `MailerService` para usar templates de recuperación.
  - Endpoint `POST /auth/reset-password` que valide el código y cambie la contraseña.
- [ ] **Verificación de Email (Hardening):**
  - Asegurar que el flujo de `verify` sea consistente y obligatorio para activar la cuenta.

## Fase 3: Blindaje de Seguridad (Hardening)

Proteger el servicio contra abusos y ataques automatizados.

- [ ] **Rate Limiting:**
  - Implementar límites de peticiones por IP (`express-rate-limit`).
  - Aplicar políticas estrictas en `/auth/login`, `/auth/signup` y recuperación de contraseña.
- [ ] **Bloqueo de Cuentas (Account Lockout):**
  - Implementar contador de intentos fallidos.
  - Bloquear temporalmente cuentas tras X intentos fallidos.

## Fase 4: Autenticación Social (OAuth2)

Reducir la fricción para nuevos usuarios.

- [ ] **Integración con Proveedores:**
  - Implementar "Login with Google".
  - Implementar "Login with GitHub".

## Fase 5: Transición a Multi-Tenancy

Una vez el servicio sea robusto, escalar hacia múltiples proyectos.

- [ ] **Cimientos de Tenants:**
  - Crear el módulo de `Tenants` para gestionar proyectos.
- [ ] **Aislamiento Físico (Database-per-tenant):**
  - Implementar el `ConnectionManager` para gestionar múltiples dbs de Mongoose dinámicamente.
- [ ] **Seguridad Multi-tenant:**
  - Incluir y validar `tenantId` en los JWT y filtrado de datos.

---

## Consideraciones Técnicas

- **Estrategia de Datos:** Mantener el uso de Mongoose, moviéndose hacia una arquitectura de modelos dinámicos en la Fase 5.
- **Prioridad:** Primero robustez y funcionalidad core, luego escalabilidad multi-proyecto.
