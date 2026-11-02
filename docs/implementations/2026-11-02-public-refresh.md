# Refresh sin access token

Fecha: 2026-11-02
Issue: #44 — Permitir refresh sin access token

## Contexto

`POST /auth/refresh` exigía un access token válido además del refresh token. Un cliente
inactivo más de una hora no podía renovar la sesión y tenía que volver a introducir sus
credenciales, aunque el refresh token siguiera vigente.

## Decisión

- `POST /auth/refresh` deja de usar el middleware de autenticación: solo requiere el
  `refreshToken` del cuerpo. Cualquier cabecera `Authorization` se ignora.
- El servicio verifica el refresh token, exige `type=refresh`, `userId` y `jti`, carga
  al usuario y comprueba que sigue verificado.
- La audiencia y el rol se derivan del propio refresh token y de la base de datos: si
  el token tiene `aud`, se resuelve el grant actual de esa aplicación (rol y validez);
  si no, se usa el rol global del usuario (owner).
- La rotación no cambia: el refresco revoca el `jti` presentado y encadena el nuevo con
  `replacedByJti`. Reutilizar un refresh token ya rotado responde `401`.
- Un refresh token de una aplicación desactivada, sin grant o con formato/ firma
  inválidos se rechaza sin emitir tokens.

## API

| Caso                                       | Resultado                                    |
| ------------------------------------------ | -------------------------------------------- |
| Refresh válido (con o sin `Authorization`) | `200` con par nuevo, misma `aud`             |
| Refresh ya rotado                          | `401 Refresh token has been revoked`         |
| Refresh inválido, expirado o malformado    | `401 InvalidTokenError`                      |
| Usuario sin grant o app inactiva           | `403 User has no access to this application` |
| Sin `refreshToken`                         | `400`                                        |

## Seguridad

El refresh token pasa a ser la única credencial del endpoint. Sigue siendo un JWT
firmado, de un solo uso y ligado al usuario, la aplicación y el `jti` persistido, por lo
que no se puede fabricar ni reutilizar. No se añaden credenciales de cliente.

## Fuera de alcance

- Sesiones concurrentes por dispositivo o app (#45).
- Revocación individual de refresh tokens.
- Cambios en la duración o el formato del token.

## Verificación

- `pnpm lint`, `pnpm format:check`, `pnpm build`.
- `pnpm test:integration`: rotación, revocación, usuario no verificado, grant revocado,
  app inactiva y conservación de la audiencia.
- `pnpm test:e2e`: refresco sin cabecera, cabecera inválida ignorada, reutilización,
  token inválido y `aud` conservada.
