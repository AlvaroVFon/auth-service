# Aplicaciones del hogar y permisos por usuario

Fecha: 2026-11-01
Issue: #38 — Modelar aplicaciones y permisos por usuario

## Contexto

El servicio tenía un módulo `tenants` con un login por `tenantSecret` pensado como app cliente. Ese modelo no describía el uso real (un único hogar con varias aplicaciones), el token de tenant no lo aceptaba ningún middleware y el secreto se guardaba en claro.

## Decisión

- El hogar es único: no existe `Tenant` ni multi-hogar.
- `Application` representa cada app del hogar con `name`, `slug` y `audience` únicos, más `active`.
- `Grant` representa el permiso de un usuario en una aplicación: par `(userId, applicationId)` único y rol `viewer`, `editor` o `admin`.
- Un usuario puede tener roles distintos en apps distintas y no tener permiso en otras.
- Los endpoints HTTP, la emisión de tokens con audiencia y el bootstrap del owner quedan fuera de esta issue (#39–#42).

## Modelo de datos

| Colección      | Campos                                                                  | Índices                         |
| -------------- | ----------------------------------------------------------------------- | ------------------------------- |
| `applications` | `name`, `slug` (lowercase), `audience`, `active`, `createdAt/updatedAt` | `slug` único, `audience` único  |
| `grants`       | `userId`, `applicationId`, `role`, `createdAt/updatedAt`                | `(userId, applicationId)` único |

`GrantRoles` vive en `src/grants/grants.interface.ts` y no modifica el enum global `Roles`, que se sustituye en #41.

## Servicios

- `ApplicationsService`: `create`, `findById`, `findBySlug`, `findAll`, `findAssignableById` (devuelve `null` para apps inactivas).
- `GrantsService`: `assignRole` (upsert idempotente, valida que la aplicación sea asignable y que el usuario exista), `findByUserAndApplication`, `listByUser`.
- Ambos se exponen en `createApplicationComposition()` como `applications` y `grants`.

## Retirada de tenants

Se eliminaron el schema, el servicio, el port, el controller y la ruta `/auth/tenant/login`, junto con `generateTenantToken` y los claims de tenant. Un test e2e comprueba que la ruta responde 404.

## Migración de datos

Eliminar el módulo detiene las lecturas y escrituras, pero no borra lo ya guardado: cualquier entorno que usó el antiguo login por tenant conserva en la colección `tenants` los `secret` en claro (el motivo de la retirada en ADR-003). Antes de desplegar, ejecutar sobre la base de datos del entorno la limpieza puntual:

```js
db.tenants.drop();
```

Paso de despliegue:

1. Backup de la base de datos.
2. `db.tenants.drop()` en cada entorno que tuvo el módulo activo.
3. Desplegar esta versión y comprobar que `/auth/tenant/login` responde 404.

No hay script de migración versionado a propósito: la colección era código muerto (ningún middleware aceptaba el token) y no se migra ningún dato a `applications`/`grants`.

## Pendientes para #39–#42

> Resueltos en #41: el borrado de un usuario limpia sus grants y las lecturas ocultan aplicaciones inactivas (ver `2026-11-02-app-admin-owner.md`).

- `UsersService.deleteOneById()` no borra los `grants` del usuario: un usuario eliminado deja filas huérfanas que ya no se pueden resolver. El borrado en cascada (o excluir usuarios inexistentes en las lecturas) entra con la autorización por aplicación en #41.
- `findByUserAndApplication()` y `listByUser()` devuelven el grant sin mirar `Application.active`, mientras que `assignRole()` rechaza aplicaciones no asignables. Los consumidores de #39/#40 deben comprobar la aplicación; una variante de lectura que solo devuelva apps activas se valorará en #41.

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test:unit`, `pnpm test:integration` y `pnpm test:e2e`.
- Tests nuevos: `test/integration/src/applications/applications.service.test.ts`, `test/integration/src/grants/grants.service.test.ts`, `test/integration/src/grants/grants.schema.test.ts` y `test/e2e/auth/tenant-login-removed.test.ts`.
