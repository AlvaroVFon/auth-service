# Administración de aplicaciones, permisos y owner inicial

Fecha: 2026-11-02
Issue: #41 — Gestionar aplicaciones, permisos y owner inicial

## Contexto

El catálogo de `Application` y los `Grant` existían desde #38, pero no había forma de
crear apps, asignar permisos ni provisionar el primer administrador sin tocar MongoDB
a mano. Los endpoints de `/users` exigían el rol global `ADMIN`, que nadie podía
obtener. Además quedaban dos pendientes de #38: borrar los grants al borrar un usuario
y no devolver grants de aplicaciones inactivas.

## Decisión

- El hogar tiene un único **owner**, representado con el rol global `owner` en `User`
  y protegido por un índice único parcial (`role=owner`). Los valores `ADMIN` y `USER`
  se conservan para datos y tokens antiguos, pero `ADMIN` ya no autoriza nada.
- El owner se provisiona de forma idempotente desde `OWNER_EMAIL`/`OWNER_PASSWORD`, en
  el arranque o con `pnpm bootstrap:owner`. Si ya existe un owner:
  - mismo email → no-op (`created: false`);
  - email distinto → conflicto, no se crea un segundo owner;
  - la contraseña configurada no rota la existente (se usa el flujo de reset);
  - un usuario existente que no es owner nunca se promociona.
- La autorización se resuelve contra la base de datos en cada petición: el owner pasa
  siempre; el resto necesita un `Grant` con rol `admin` para la aplicación indicada en
  la ruta. Revocar el grant surte efecto en la siguiente petición.
- Las escrituras de `/users` ignoran cualquier `role` enviado en el cuerpo: solo el
  bootstrap puede crear owners.

## API de administración

Todas las rutas requieren un access token válido (cabecera `Authorization: Bearer`).

| Método   | Ruta                                          | Autorización            | Respuesta             |
| -------- | --------------------------------------------- | ----------------------- | --------------------- |
| `POST`   | `/applications`                               | owner                   | 201 / 400             |
| `GET`    | `/applications`                               | owner                   | 200                   |
| `GET`    | `/applications/:id`                           | owner                   | 200 / 404             |
| `PUT`    | `/applications/:applicationId/grants`         | owner o admin de la app | 200 / 400 / 403 / 404 |
| `GET`    | `/applications/:applicationId/grants`         | owner o admin de la app | 200 / 403 / 404       |
| `GET`    | `/applications/:applicationId/grants/:userId` | owner o admin de la app | 200 / 403 / 404       |
| `DELETE` | `/applications/:applicationId/grants/:userId` | owner o admin de la app | 204 / 403 / 404       |

- `PUT` hace upsert del par usuario-aplicación y devuelve el grant resultante.
- Los duplicados de `slug` o `audience` responden `400 ENTITY_ALREADY_EXISTS`, igual
  que el resto de errores de entidad del servicio.
- Un `applicationId` de otra app devuelve 403; un identificador con formato inválido
  devuelve 400; un grant inexistente al revocar devuelve 404.
- `GET /applications/:applicationId/grants` solo lista permisos de aplicaciones
  activas; una app inactiva responde 404.

## Bootstrap

```sh
OWNER_EMAIL=owner@home.example OWNER_PASSWORD='...' pnpm bootstrap:owner
```

El arranque normal también ejecuta el bootstrap después de conectar a MongoDB y antes
de escuchar peticiones, si ambas variables están configuradas. Si solo se define una,
el arranque falla para exponer el error de configuración. Un conflicto de owner también
aborta el arranque: es preferible a servir una instancia sin administrador. El proceso
solo registra el email, nunca la contraseña.

## Migración y despliegue

1. Elegir las credenciales del owner y desplegar con `OWNER_EMAIL`/`OWNER_PASSWORD`.
2. Comprobar que el arranque registra `Owner created` y que `POST /auth/login` con esas
   credenciales devuelve un token con rol `owner`.
3. Crear las aplicaciones y asignar el primer `admin` de cada app.
4. Los usuarios y tokens con rol global `ADMIN` dejan de poder usar `/users`; deben
   pasar a actuar como owner o como admin de app.

Rollback: revertir el cambio de guardas de rutas y desplegar la imagen anterior. El
usuario owner creado es inerte para versiones antiguas. No se borra ningún dato.

## Pendientes resueltos de #38

- `UsersService.deleteOneById` limpia los grants del usuario mediante
  `UserGrantsCleanerPort`, implementado por `GrantsService`.
- `findByUserAndApplication` y `listByUser` ocultan grants de aplicaciones inactivas,
  igual que ya hacía `assignRole`.

## Fuera de alcance

- Login contra una app concreta y tokens con audiencia (#39/#40). Por eso la revocación
  se prueba como denegación de autorización y desaparición del grant, no como un login
  fallido contra la app.
- Revocar tokens ya emitidos, actualizar/desactivar apps, rotar el email del owner,
  owners múltiples, invitaciones, MFA y auditoría.

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test:unit`: bootstrap, configuración y provisión del owner, autorización por
  aplicación.
- `pnpm test:integration`: owner idempotente, índice único, filtros de apps inactivas,
  revocación y borrado masivo de grants.
- `pnpm test:e2e`: alta de apps, asignación/consulta/revocación de permisos, límites
  entre apps (403), owner creado desde cero + login + alta de app, y cascada al borrar
  un usuario.
