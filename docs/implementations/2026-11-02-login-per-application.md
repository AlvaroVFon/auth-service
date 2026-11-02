# Login contra una aplicación concreta

Fecha: 2026-11-02
Issue: #40 — Autenticar usuarios contra una aplicación concreta

## Contexto

Hasta ahora `POST /auth/login` emitía un token con el rol global del usuario y sin
audiencia, por lo que el mismo token servía en cualquier aplicación. El catálogo de
`Application` y los `Grant` ya existían desde #38, y #39 añadió RS256 + JWKS, pero el
login seguía sin tenerlos en cuenta.

## Decisión

- `POST /auth/login` acepta un campo opcional `application` con el `slug` o la
  `audience` de la aplicación.
- Con `application`, el login exige un `Grant` activo del usuario en esa aplicación y
  emite un par de tokens (access y refresh) con `aud` = audience de la app y `role` =
  rol del grant (`viewer`, `editor` o `admin`).
- Sin `application`, solo el usuario con rol global `owner` puede autenticarse; recibe
  el token global de administración que ya usaba #41. Cualquier otra cuenta recibe
  `403` para que nadie pueda saltarse el contrato de aplicación.
- Las credenciales se verifican antes de resolver la aplicación: credenciales
  incorrectas o usuario inexistente devuelven el mismo `401` genérico, sin revelar
  información.
- Aplicación inexistente, inactiva o sin grant se colapsan en un único `403`
  (`User has no access to this application`) para no permitir enumerar aplicaciones.
- El refresh conserva la audiencia de la sesión y vuelve a derivar el rol del grant en
  cada rotación. Si el grant se revoca o la app se desactiva, el refresh responde
  `403`; si el refresh token pertenece a otra aplicación, `401`.
- `/auth/refresh`, `/auth/logout` y las rutas de grants aceptan tokens con o sin
  audiencia. `/users` y `/applications` siguen exigiendo un token global (sin `aud`),
  de forma que un token de aplicación nunca satisface un rol global.
- Las rutas de grants comparan la audiencia del token con la de la aplicación de la
  ruta antes de consultar el grant, y siguen leyendo el grant de la base de datos para
  que la revocación sea inmediata.

## API

| Caso                                   | Resultado                                    |
| -------------------------------------- | -------------------------------------------- |
| Credenciales válidas + grant en la app | `200` con access y refresh con `aud` y rol   |
| Credenciales válidas sin `application` | `200` solo si el usuario es owner global     |
| Usuario sin `application` y no owner   | `403 An application is required`             |
| App inexistente, inactiva o sin grant  | `403 User has no access to this application` |
| Email o password incorrectos           | `401 Invalid email or password`              |
| Sin email o password                   | `400 Email and password are required`        |

## Compatibilidad y despliegue

Cambio incompatible para clientes que iniciaban sesión sin indicar aplicación: a
partir de ahora deben enviar `application` (slug o audience) y tener un grant. El
owner sigue usando el login sin `application` para administrar `/applications` y
`/users`.

Desplegar primero el servicio y después actualizar las apps. Rollback: revertir el
servicio rechaza los tokens con `aud` recién emitidos, por lo que las apps tendrán que
volver a iniciar sesión contra el login antiguo; no se borra ningún dato.

## Fuera de alcance

- SSO o intercambio de tokens entre aplicaciones.
- Refresh público y sesiones concurrentes por dispositivo o por app: el login sigue
  revocando el resto de refresh tokens del usuario.
- Revocar access tokens ya emitidos al revocar un grant o desactivar una app; expiran
  con su `exp` y solo el refresh se revalida.
- Grants implícitos para el owner: si quiere un token de aplicación debe tener su
  propio grant.

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test:unit`: resolución de app, firma de pares con audiencia, rotación ligada a
  la audiencia, `authenticateAny` y autorización de app admin.
- `pnpm test:integration`: lookups de aplicación, `ApplicationTokenService`, login y
  refresh por aplicación (AC-1 a AC-4).
- `pnpm test:e2e`: login por app, 401/403, owner global y aislamiento de tokens de app
  en refresh y grants.
